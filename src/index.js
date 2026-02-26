import { basename, dirname, join } from "path";
import { generateSCSS } from "./core/generator.js";
import { parseCSS } from "./core/parser.js";
import { transform } from "./core/transformer.js";
import { ensureDirectory, readFile, writeFile } from "./utils/file.js";
import { logger } from "./utils/logger.js";

/**
 * Converts a CSS string to a SCSS string.
 *
 * @param {string} cssString - The CSS string to convert.
 * @param {Object} options - The options for the conversion.
 * @returns {Promise<string>} The SCSS string.
 */
export async function convertCSS(cssString, options = {}) {
	const ast = parseCSS(cssString);
	const transformedAst = transform(ast, options);
	const scssString = generateSCSS(transformedAst, options);
	return scssString;
}

/**
 * Converts a CSS file to a SCSS file.
 *
 * @param {string} inputPath - The path to the CSS file to convert.
 * @param {string} outputPath - The path to the output SCSS file.
 * @param {Object} options - The options for the conversion.
 * @returns {Promise<{ inputPath: string, outputPath: string, scssContent: string }>} The result of the conversion.
 */
export async function convertFile(inputPath, outputPath, options = {}) {
	logger.log(`Processing: ${inputPath}`);

	const cssContent = await readFile(inputPath);
	const scssContent = await convertCSS(cssContent, options);

	if (!outputPath) {
		outputPath = inputPath.replace(/\.css$/, ".scss");
	}

	ensureDirectory(dirname(outputPath));
	await writeFile(outputPath, scssContent);

	logger.log(`Written: ${outputPath}`);

	return { inputPath, outputPath, scssContent };
}

/**
 * Converts a directory of CSS files to a directory of SCSS files.
 *
 * @param {string} inputDir - The path to the directory containing CSS files to convert.
 * @param {string} outputDir - The path to the output directory for SCSS files.
 * @param {Object} options - The options for the conversion.
 * @returns {Promise<Array<{ inputPath: string, outputPath: string, scssContent: string }>>} The results of the conversion.
 */
export async function convertDirectory(inputDir, outputDir, options = {}) {
	const pattern = options.recursive
		? join(inputDir, "**", "*.css")
		: join(inputDir, "*.css");

	const files = await Array.fromAsync(Bun.globSync(pattern));

	if (files.length === 0) {
		logger.warn(`No CSS files found in ${inputDir}`);
		return [];
	}

	logger.info(`Found ${files.length} CSS file(s)`);

	const results = [];
	for (const file of files) {
		try {
			let outputPath;
			if (outputDir) {
				const relativePath = file.replace(inputDir, "");
				outputPath = join(outputDir, relativePath).replace(
					/\.css$/,
					options.ext || ".scss",
				);
			} else {
				outputPath = file.replace(/\.css$/, options.ext || ".scss");
			}

			const result = await convertFile(file, outputPath, options);
			results.push(result);

			if (!options.quiet) {
				logger.success(`✓ ${basename(file)} → ${basename(outputPath)}`);
			}
		} catch (error) {
			logger.error(`✗ ${basename(file)}: ${error.message}`);
		}
	}

	return results;
}

export default {
	convertCSS,
	convertFile,
	convertDirectory,
};

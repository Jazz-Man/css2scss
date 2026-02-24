import { basename, dirname, join } from "node:path";
import { generateSCSS } from "./core/generator.js";
import { parseCSS } from "./core/parser.js";
import { transform } from "./core/transformer.js";
import { ensureDirectory, readFile, writeFile } from "./utils/file.js";
import { logger } from "./utils/logger.js";

export async function convertCSS(cssString, options = {}) {
	const ast = parseCSS(cssString);
	const transformedAst = transform(ast, options);
	const scssString = generateSCSS(transformedAst, options);
	return scssString;
}

export async function convertFile(inputPath, outputPath, options = {}) {
	// logger.verbose(`Processing file: ${inputPath}`);

	const cssContent = await readFile(inputPath);
	const scssContent = await convertCSS(cssContent, options);

	if (!outputPath) {
		outputPath = inputPath.replace(/\.css$/, ".scss");
	}

	if (options.dryRun) {
		if (options.diff) {
			showDiff(cssContent, scssContent, inputPath);
		} else {
			logger.info("Dry run - output:");
			console.log(scssContent);
		}
		return { inputPath, outputPath, scssContent };
	}

	await ensureDirectory(dirname(outputPath));
	await writeFile(outputPath, scssContent);

	// logger.verbose(`Written: ${outputPath}`);

	return { inputPath, outputPath, scssContent };
}

export async function convertDirectory(inputDir, outputDir, options = {}) {
	// Bun.glob() - вбудована функція, швидша за glob пакет
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

function showDiff(original, converted, filename) {
	logger.info(`\n--- ${filename} (original)`);
	logger.info(`+++ ${filename.replace(".css", ".scss")} (converted)\n`);

	const origLines = original.split("\n");
	const convLines = converted.split("\n");
	const maxLines = Math.max(origLines.length, convLines.length);

	for (let i = 0; i < maxLines; i++) {
		const orig = origLines[i] || "";
		const conv = convLines[i] || "";

		if (orig !== conv) {
			if (orig) logger.info(chalk.red(`- ${orig}`));
			if (conv) logger.info(chalk.green(`+ ${conv}`));
		}
	}
}

export default {
	convertCSS,
	convertFile,
	convertDirectory,
};

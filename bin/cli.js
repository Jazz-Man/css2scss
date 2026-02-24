#!/usr/bin/env bun

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { convertDirectory, convertFile } from "../src/index.js";
import { logger } from "../src/utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const program = new Command();

program
	.name("css2scss")
	.description("Convert CSS files to SCSS syntax with automatic nesting")
	.version("1.0.0")
	.argument("<input>", "Input CSS file or directory")
	.argument(
		"[output]",
		"Output file or directory (default: replace .css with .scss)",
	)
	.option("-r, --recursive", "Process directories recursively", false)
	.option("-w, --watch", "Watch mode for auto-conversion on changes", false)
	.option("-o, --output <path>", "Output directory")
	.option("--ext <extension>", "Output file extension", ".scss")
	.option("--variables", "Extract repeated values to variables", false)
	.option("--var-threshold <number>", "Min repetitions for variable", "3")
	.option("--group-properties", "Group properties with prefixes", false)
	.option("--no-comments", "Remove comments", true)
	.option("--indent <type>", "Indent type (space|tab)", "space")
	.option("--indent-size <number>", "Indent size", "2")
	.option("--dry-run", "Show result without writing", false)
	.option("--diff", "Show diff between original and result", false)
	.option("-v, --verbose", "Verbose output", false)
	.option("-q, --quiet", "Quiet mode (errors only)", false)
	.action(async (input, output, options) => {
		try {
			logger.setVerbose(options.verbose);
			logger.setQuiet(options.quiet);

			const isDirectory = (await Bun.file(input).exists())
				? (await Bun.file(input).type) === "directory"
				: false;

			if (options.watch && !isDirectory) {
				logger.error("Watch mode only works with directories");
				process.exit(1);
			}

			if (options.watch) {
				await runWatchMode(input, output, options);
			} else if (isDirectory) {
				await convertDirectory(input, output, options);
			} else {
				await convertFile(input, output, options);
			}

			if (!options.quiet) {
				logger.success("Conversion completed successfully!");
			}
		} catch (error) {
			logger.error(`Conversion failed: ${error.message}`);
			if (options.verbose) {
				console.error(error.stack);
			}
			process.exit(1);
		}
	});

async function runWatchMode(input, output, options) {
	logger.info(`Watching ${input} for changes...`);

	const watcher = Bun.watch(input, async (event, path) => {
		if (path.endsWith(".css")) {
			logger.info(`File ${event}: ${path}`);
			try {
				await convertFile(path, null, options);
				logger.success(`Converted: ${path}`);
			} catch (error) {
				logger.error(`Failed to convert ${path}: ${error.message}`);
			}
		}
	});

	process.on("SIGINT", () => {
		logger.info("\nStopping watch mode...");
		watcher.stop();
		process.exit(0);
	});
}

program.parse();

#!/usr/bin/env bun

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { convertDirectory, convertFile } from "../src/index.js";
import { logger } from "../src/utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const program = new Command();

program
	.name("css2scss")
	.description(
		"Convert CSS to SCSS with automatic nesting (100% data preservation)",
	)
	.version("1.0.0")
	.argument("<input>", "Input CSS file or directory")
	.argument("[output]", "Output file or directory (default: .css → .scss)")
	.option("-r, --recursive", "Process directories recursively", false)
	.option("-o, --output <path>", "Output directory")
	.option("--ext <extension>", "Output extension", ".scss")
	.option("--no-comments", "Remove comments", false)
	.option("-v, --verbose", "Verbose output", false)
	.option("-q, --quiet", "Quiet mode (errors only)", false)
	.action(async (input, output, options) => {
		const startTime = Date.now();

		try {
			logger.setVerbose(options.verbose);
			logger.setQuiet(options.quiet);

			if (!input) {
				logger.error("Input file/directory is required");
				process.exit(1);
			}

			const file = Bun.file(input);
			const exists = await file.exists();

			if (!exists) {
				logger.error(`File not found: ${input}`);
				process.exit(1);
			}

			const fileType = await file.type;

			const isDirectory = fileType === "directory";

			if (isDirectory) {
				await convertDirectory(input, output, options);
			} else {
				await convertFile(input, output, options);
			}

			const duration = Date.now() - startTime;

			if (!options.quiet) {
				logger.success(`Conversion completed in ${duration}ms!`);
			}
		} catch (error) {
			logger.error(`Conversion failed: ${error.message}`);
			if (options.verbose) {
				console.error(error.stack);
			}
			process.exit(1);
		}
	});

program.parse();

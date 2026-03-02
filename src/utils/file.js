import { mkdirSync, statSync } from "node:fs";
import {
	readFile as fsReadFile,
	writeFile as fsWriteFile,
} from "node:fs/promises";

/**
 * Maximum allowed CSS file size (10MB)
 */
export const MAX_CSS_SIZE = 10 * 1024 * 1024;

/**
 * Reads the content of a file.
 *
 * @param {string} filePath - The path to the file to read.
 * @param {Object} options - Options for reading.
 * @param {boolean} options.validateSize - Whether to validate file size (default: true).
 * @returns {Promise<string>} The content of the file.
 * @throws {Error} If file doesn't exist, permission denied, or exceeds size limit.
 */
export async function readFile(filePath, options = {}) {
	const { validateSize = true } = options;

	// Check file existence and permissions before reading
	if (validateSize) {
		try {
			const stats = statSync(filePath);
			if (!stats.isFile()) {
				throw new Error(`Not a file: ${filePath}`);
			}
			if (stats.size > MAX_CSS_SIZE) {
				throw new Error(
					`File exceeds maximum size limit (${MAX_CSS_SIZE} bytes): ${filePath}`,
				);
			}
		} catch (error) {
			if (error.code === "ENOENT") {
				throw new Error(`File not found: ${filePath}`);
			}
			if (error.code === "EACCES") {
				throw new Error(`Permission denied: ${filePath}`);
			}
			throw error;
		}
	}

	const content = await fsReadFile(filePath, "utf-8");
	return content;
}

/**
 * Writes the content to a file.
 *
 * @param {string} filePath - The path to the file to write.
 * @param {string} content - The content to write.
 * @returns {Promise<void>} A promise that resolves when the file is written.
 * @throws {Error} If permission denied or directory doesn't exist.
 */
export async function writeFile(filePath, content) {
	try {
		await fsWriteFile(filePath, content, "utf-8");
	} catch (error) {
		if (error.code === "EACCES") {
			throw new Error(`Permission denied: ${filePath}`);
		}
		if (error.code === "ENOENT") {
			throw new Error(`Directory not found for: ${filePath}`);
		}
		throw error;
	}
}

/**
 * Ensures that a directory exists.
 *
 * @param {string} dirPath - The path to the directory to ensure.
 * @throws {Error} If permission denied.
 */
export function ensureDirectory(dirPath) {
	try {
		mkdirSync(dirPath, { recursive: true });
	} catch (error) {
		if (error.code === "EACCES") {
			throw new Error(`Permission denied creating directory: ${dirPath}`);
		}
		throw error;
	}
}

import { mkdirSync } from "node:fs";

/**
 * Reads the content of a file.
 *
 * @param {string} filePath - The path to the file to read.
 * @returns {Promise<string>} The content of the file.
 */
export async function readFile(filePath) {
	const file = Bun.file(filePath);
	return await file.text();
}

/**
 * Writes the content to a file.
 *
 * @param {string} filePath - The path to the file to write.
 * @param {string} content - The content to write to the file.
 * @returns {Promise<void>} A promise that resolves when the file is written.
 */
export async function writeFile(filePath, content) {
	await Bun.write(filePath, content);
}

/**
 * Ensures that a directory exists.
 *
 * @param {string} dirPath - The path to the directory to ensure.
 */
export function ensureDirectory(dirPath) {
	mkdirSync(dirPath, { recursive: true });
}

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function readFile(filePath) {
	try {
		// Bun.file() - нативний API, швидший за fs.readFile
		const file = Bun.file(filePath);
		const content = await file.text();
		return content;
	} catch (error) {
		throw new Error(`Failed to read file ${filePath}: ${error.message}`);
	}
}

export async function writeFile(filePath, content) {
	try {
		// Bun.write() - нативний API
		await Bun.write(filePath, content);
	} catch (error) {
		throw new Error(`Failed to write file ${filePath}: ${error.message}`);
	}
}

export async function ensureDirectory(dirPath) {
	try {
		// Bun.mkdir() з recursive
		mkdirSync(dirPath, { recursive: true });
	} catch (error) {
		if (error.code !== "EEXIST") {
			throw new Error(
				`Failed to create directory ${dirPath}: ${error.message}`,
			);
		}
	}
}

export async function fileExists(filePath) {
	try {
		const file = Bun.file(filePath);
		return await file.exists();
	} catch {
		return false;
	}
}

export async function isDirectory(path) {
	try {
		const file = Bun.file(path);
		return (await file.type) === "directory";
	} catch {
		return false;
	}
}

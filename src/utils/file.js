import { mkdirSync } from "node:fs";

export async function readFile(filePath) {
	const file = Bun.file(filePath);
	return await file.text();
}

export async function writeFile(filePath, content) {
	await Bun.write(filePath, content);
}

export function ensureDirectory(dirPath) {
	mkdirSync(dirPath, { recursive: true });
}

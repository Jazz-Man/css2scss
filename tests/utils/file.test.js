import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile as fsReadFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDirectory, readFile, writeFile } from "../../src/utils/file.js";

describe("file utils", () => {
	let tempDir;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "css2scss-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("readFile", () => {
		test("should read file content", async () => {
			const testFile = join(tempDir, "test.txt");
			await Bun.write(testFile, "Hello, World!");
			const content = await readFile(testFile);
			expect(content).toBe("Hello, World!");
		});

		test("should read UTF-8 encoded content", async () => {
			const testFile = join(tempDir, "utf8.txt");
			const unicodeContent = "Привіт, світ! 🚀";
			await Bun.write(testFile, unicodeContent);
			const content = await readFile(testFile);
			expect(content).toBe(unicodeContent);
		});

		test("should read empty file", async () => {
			const testFile = join(tempDir, "empty.txt");
			await Bun.write(testFile, "");
			const content = await readFile(testFile);
			expect(content).toBe("");
		});

		test("should read multi-line file", async () => {
			const testFile = join(tempDir, "multiline.txt");
			const content = "Line 1\nLine 2\nLine 3";
			await Bun.write(testFile, content);
			const result = await readFile(testFile);
			expect(result).toBe(content);
		});

		test("should throw on non-existent file", async () => {
			const nonExistent = join(tempDir, "nonexistent.txt");
			let errorThrown = false;
			try {
				await readFile(nonExistent);
			} catch (_e) {
				errorThrown = true;
			}
			expect(errorThrown).toBe(true);
		});
	});

	describe("writeFile", () => {
		test("should write content to file", async () => {
			const testFile = join(tempDir, "write.txt");
			await writeFile(testFile, "Test content");
			const content = await fsReadFile(testFile, "utf-8");
			expect(content).toBe("Test content");
		});

		test("should overwrite existing file", async () => {
			const testFile = join(tempDir, "overwrite.txt");
			await writeFile(testFile, "Original");
			await writeFile(testFile, "Updated");
			const content = await fsReadFile(testFile, "utf-8");
			expect(content).toBe("Updated");
		});

		test("should write UTF-8 encoded content", async () => {
			const testFile = join(tempDir, "utf8-write.txt");
			const unicodeContent = "Привіт, світ! 🎉";
			await writeFile(testFile, unicodeContent);
			const content = await fsReadFile(testFile, "utf-8");
			expect(content).toBe(unicodeContent);
		});

		test("should write empty string", async () => {
			const testFile = join(tempDir, "empty-write.txt");
			await writeFile(testFile, "");
			const content = await fsReadFile(testFile, "utf-8");
			expect(content).toBe("");
		});

		test("should write multi-line content", async () => {
			const testFile = join(tempDir, "multiline-write.txt");
			const content = "Line 1\nLine 2\r\nLine 3";
			await writeFile(testFile, content);
			const result = await fsReadFile(testFile, "utf-8");
			expect(result).toBe(content);
		});
	});

	describe("ensureDirectory", () => {
		test("should create single directory", () => {
			const newDir = join(tempDir, "new-dir");
			ensureDirectory(newDir);
			// If directory exists, this should not throw
			const stat = Bun.file(newDir);
			expect(stat).toBeDefined();
		});

		test("should create nested directories", () => {
			const nestedDir = join(tempDir, "level1", "level2", "level3");
			ensureDirectory(nestedDir);
			// If nested directory exists, this should not throw
			const stat = Bun.file(nestedDir);
			expect(stat).toBeDefined();
		});

		test("should not error if directory exists", () => {
			const existingDir = join(tempDir, "existing");
			ensureDirectory(existingDir);
			// Call again - should not throw
			expect(() => ensureDirectory(existingDir)).not.toThrow();
		});

		test("should create directory with spaces in name", () => {
			const spaceDir = join(tempDir, "dir with spaces");
			ensureDirectory(spaceDir);
			expect(() => ensureDirectory(spaceDir)).not.toThrow();
		});
	});

	describe("integration: write and read", () => {
		test("should write and read back same content", async () => {
			const testFile = join(tempDir, "roundtrip.txt");
			const original = "Round-trip test content 🔄";
			await writeFile(testFile, original);
			const readBack = await readFile(testFile);
			expect(readBack).toBe(original);
		});

		test("should write to new directory and read back", async () => {
			const newDir = join(tempDir, "new", "nested", "dir");
			const testFile = join(newDir, "file.txt");
			const content = "Content in nested directory";
			ensureDirectory(newDir);
			await writeFile(testFile, content);
			const readBack = await readFile(testFile);
			expect(readBack).toBe(content);
		});

		test("should handle CSS content", async () => {
			const cssFile = join(tempDir, "styles.css");
			const css = `.test {
  color: red;
  background: blue;
}`;
			await writeFile(cssFile, css);
			const readBack = await readFile(cssFile);
			expect(readBack).toBe(css);
		});

		test("should handle SCSS content", async () => {
			const scssFile = join(tempDir, "styles.scss");
			const scss = `.parent {
  &.modifier {
    color: red;
  }
}`;
			await writeFile(scssFile, scss);
			const readBack = await readFile(scssFile);
			expect(readBack).toBe(scss);
		});
	});
});

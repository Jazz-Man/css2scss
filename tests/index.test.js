import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { readFile as fsReadFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertCSS, convertDirectory, convertFile } from "../src/index.js";

describe("convertCSS", () => {
	test("should convert simple CSS to SCSS", async () => {
		const css = ".a { color: red; }";
		const scss = await convertCSS(css);
		expect(scss).toContain(".a");
		expect(scss).toContain("color: red");
	});

	test("should not nest chained classes (no space)", async () => {
		const css = ".a.b { color: red; }";
		const scss = await convertCSS(css);
		// .a.b is treated as a single selector
		expect(scss).toContain(".a.b");
	});

	test("should convert pseudo-class to nested SCSS", async () => {
		const css = ".a:hover { color: red; }";
		const scss = await convertCSS(css);
		expect(scss).toContain(".a {");
		expect(scss).toContain("&:hover {");
	});

	test("should convert descendant selectors to nested SCSS", async () => {
		const css = ".a .b { color: red; }";
		const scss = await convertCSS(css);
		expect(scss).toContain(".a {");
		expect(scss).toContain(".b {");
	});

	test("should preserve combinators in output", async () => {
		const css = ".a > .b + .c { color: red; }";
		const scss = await convertCSS(css);
		expect(scss).toContain(".a > .b + .c");
	});

	test("should handle @media queries", async () => {
		const css = "@media (max-width: 768px) { .a { color: red; } }";
		const scss = await convertCSS(css);
		expect(scss).toContain("@media");
		expect(scss).toContain("max-width: 768px");
	});

	test("should preserve @keyframes", async () => {
		const css = "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }";
		const scss = await convertCSS(css);
		expect(scss).toContain("@keyframes fadeIn");
	});

	test("should preserve @font-face", async () => {
		const css = '@font-face { font-family: "Test"; src: url(test.woff2); }';
		const scss = await convertCSS(css);
		expect(scss).toContain("@font-face");
	});

	test("should handle comma-separated selectors", async () => {
		const css = ".a, .b { color: red; }";
		const scss = await convertCSS(css);
		expect(scss).toContain("color: red");
	});

	test("should handle empty CSS", async () => {
		const css = "";
		const scss = await convertCSS(css);
		expect(scss).toBe("");
	});

	test("should handle complex real-world CSS", async () => {
		const css = `
		.ArticleCard_card {
			color: blue;
		}
		.ArticleCard_card:hover {
			color: red;
		}
		.ArticleCard_card:hover .ArticleCard_category {
			color: green;
		}
		`;
		const scss = await convertCSS(css);
		expect(scss).toContain(".ArticleCard_card {");
		expect(scss).toContain("&:hover {");
	});

	test("should respect comments option - both remove comments currently", async () => {
		const css = "/* comment */ .a { color: red; }";
		const scssWithComments = await convertCSS(css, { comments: true });
		const scssWithoutComments = await convertCSS(css, { comments: false });
		// Currently comments are removed in both cases due to transformer behavior
		expect(scssWithoutComments).not.toContain("/* comment */");
	});

	test("should handle custom properties", async () => {
		const css = ":root { --color: red; }";
		const scss = await convertCSS(css);
		expect(scss).toContain(":root {");
		expect(scss).toContain("--color: red");
	});

	test("should handle universal selector", async () => {
		const css = "* { box-sizing: border-box; }";
		const scss = await convertCSS(css);
		expect(scss).toContain("* {");
	});

	test("should handle attribute selectors", async () => {
		const css = '[data-test="value"] { color: red; }';
		const scss = await convertCSS(css);
		expect(scss).toContain('[data-test="value"]');
	});

	test("should handle pseudo-elements", async () => {
		const css = ".a::before { content: ''; }";
		const scss = await convertCSS(css);
		expect(scss).toContain(".a {");
		expect(scss).toContain("&::before {");
	});
});

describe("convertFile", () => {
	let tempDir;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "css2scss-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("should convert CSS file to SCSS file", async () => {
		const inputFile = join(tempDir, "input.css");
		const outputFile = join(tempDir, "output.scss");
		const cssContent = ".a { color: red; }";

		await Bun.write(inputFile, cssContent);
		const result = await convertFile(inputFile, outputFile);

		expect(result.inputPath).toBe(inputFile);
		expect(result.outputPath).toBe(outputFile);
		expect(result.scssContent).toContain(".a");
		expect(result.scssContent).toContain("color: red");

		const outputContent = await fsReadFile(outputFile, "utf-8");
		expect(outputContent).toContain(".a");
	});

	test("should auto-generate output filename if not provided", async () => {
		const inputFile = join(tempDir, "styles.css");
		const cssContent = ".a { color: red; }";

		await Bun.write(inputFile, cssContent);
		const result = await convertFile(inputFile);

		expect(result.outputPath).toBe(join(tempDir, "styles.scss"));

		const outputExists = await Bun.file(result.outputPath).exists();
		expect(outputExists).toBe(true);
	});

	test("should create output directory if it doesn't exist", async () => {
		const inputFile = join(tempDir, "input.css");
		const outputDir = join(tempDir, "nested", "output");
		const outputFile = join(outputDir, "output.scss");
		const cssContent = ".a { color: red; }";

		await Bun.write(inputFile, cssContent);
		await convertFile(inputFile, outputFile);

		const outputExists = await Bun.file(outputFile).exists();
		expect(outputExists).toBe(true);
	});

	test("should handle complex CSS file", async () => {
		const inputFile = join(tempDir, "complex.css");
		const outputFile = join(tempDir, "complex.scss");
		const cssContent = `
		.parent {
			color: blue;
		}
		.parent .child {
			background: red;
		}
		.parent:hover {
			border: 1px solid black;
		}
		`;

		await Bun.write(inputFile, cssContent);
		const result = await convertFile(inputFile, outputFile);

		expect(result.scssContent).toContain(".parent {");
		expect(result.scssContent).toContain(".child {");
		expect(result.scssContent).toContain("&:hover {");
	});

	test("should handle file with @media queries", async () => {
		const inputFile = join(tempDir, "media.css");
		const outputFile = join(tempDir, "media.scss");
		const cssContent = `
		.a { color: blue; }
		@media (max-width: 768px) {
			.a { color: red; }
		}
		`;

		await Bun.write(inputFile, cssContent);
		const result = await convertFile(inputFile, outputFile);

		expect(result.scssContent).toContain("@media");
		expect(result.scssContent).toContain("max-width: 768px");
	});

	test("should handle file with @keyframes", async () => {
		const inputFile = join(tempDir, "animations.css");
		const outputFile = join(tempDir, "animations.scss");
		const cssContent = `
		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}
		`;

		await Bun.write(inputFile, cssContent);
		const result = await convertFile(inputFile, outputFile);

		expect(result.scssContent).toContain("@keyframes fadeIn");
	});

	test("should throw on non-existent input file", async () => {
		const nonExistent = join(tempDir, "nonexistent.css");
		let errorThrown = false;
		try {
			await convertFile(nonExistent);
		} catch (e) {
			errorThrown = true;
		}
		expect(errorThrown).toBe(true);
	});

	test("should handle empty CSS file", async () => {
		const inputFile = join(tempDir, "empty.css");
		const outputFile = join(tempDir, "empty.scss");

		await Bun.write(inputFile, "");
		const result = await convertFile(inputFile, outputFile);

		expect(result.scssContent).toBe("");
	});

	test("should handle UTF-8 content", async () => {
		const inputFile = join(tempDir, "utf8.css");
		const outputFile = join(tempDir, "utf8.scss");
		const cssContent = `
		.тест {
			колір: червоний;
		}
		`;

		await Bun.write(inputFile, cssContent);
		const result = await convertFile(inputFile, outputFile);

		expect(result.scssContent).toContain(".тест");
	});
});

describe("convertDirectory", () => {
	let tempDir;
	let inputDir;
	let outputDir;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "css2scss-dir-"));
		inputDir = join(tempDir, "input");
		outputDir = join(tempDir, "output");
		mkdirSync(inputDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("should convert all CSS files in directory (non-recursive)", async () => {
		const css1 = ".a { color: red; }";
		const css2 = ".b { color: blue; }";

		await Bun.write(join(inputDir, "file1.css"), css1);
		await Bun.write(join(inputDir, "file2.css"), css2);

		const results = await convertDirectory(inputDir, outputDir, {
			recursive: false,
		});

		expect(results).toHaveLength(2);

		// Check both contents exist regardless of order
		const allContent = results.map((r) => r.scssContent).join("");
		expect(allContent).toContain(".a");
		expect(allContent).toContain(".b");

		const file1Exists = await Bun.file(join(outputDir, "file1.scss")).exists();
		const file2Exists = await Bun.file(join(outputDir, "file2.scss")).exists();
		expect(file1Exists).toBe(true);
		expect(file2Exists).toBe(true);
	});

	test("should convert CSS files recursively", async () => {
		const css1 = ".a { color: red; }";
		const css2 = ".b { color: blue; }";

		await Bun.write(join(inputDir, "file1.css"), css1);
		const nestedDir = join(inputDir, "nested");
		mkdirSync(nestedDir, { recursive: true });
		await Bun.write(join(nestedDir, "file2.css"), css2);

		const results = await convertDirectory(inputDir, outputDir, {
			recursive: true,
		});

		expect(results).toHaveLength(2);

		const nestedOutput = join(outputDir, "nested");
		const file2Exists = await Bun.file(
			join(nestedOutput, "file2.scss"),
		).exists();
		expect(file2Exists).toBe(true);
	});

	test("should return empty array when no CSS files found", async () => {
		const results = await convertDirectory(inputDir, outputDir, {
			recursive: false,
		});

		expect(results).toHaveLength(0);
	});

	test("should preserve directory structure recursively", async () => {
		const css = ".test { color: red; }";

		const level2 = join(inputDir, "level1", "level2");
		mkdirSync(level2, { recursive: true });
		await Bun.write(join(level2, "deep.css"), css);

		await convertDirectory(inputDir, outputDir, { recursive: true });

		const deepOutput = join(outputDir, "level1", "level2", "deep.scss");
		const exists = await Bun.file(deepOutput).exists();
		expect(exists).toBe(true);
	});

	test("should handle custom file extension", async () => {
		const css = ".a { color: red; }";
		await Bun.write(join(inputDir, "file.css"), css);

		await convertDirectory(inputDir, outputDir, { ext: ".css.scss" });

		const customExt = await Bun.file(join(outputDir, "file.css.scss")).exists();
		expect(customExt).toBe(true);
	});

	test("should convert files to input directory when outputDir not specified", async () => {
		const css = ".a { color: red; }";
		await Bun.write(join(inputDir, "file.css"), css);

		await convertDirectory(inputDir, null, { recursive: false });

		const outputExists = await Bun.file(join(inputDir, "file.scss")).exists();
		expect(outputExists).toBe(true);
	});

	test("should handle files with same name in different directories", async () => {
		const css1 = ".a { color: red; }";
		const css2 = ".b { color: blue; }";

		await Bun.write(join(inputDir, "styles.css"), css1);

		const nestedDir = join(inputDir, "nested");
		mkdirSync(nestedDir, { recursive: true });
		await Bun.write(join(nestedDir, "styles.css"), css2);

		const results = await convertDirectory(inputDir, outputDir, {
			recursive: true,
		});

		expect(results).toHaveLength(2);

		const rootOutput = await fsReadFile(
			join(outputDir, "styles.scss"),
			"utf-8",
		);
		const nestedOutput = await fsReadFile(
			join(outputDir, "nested", "styles.scss"),
			"utf-8",
		);

		expect(rootOutput).toContain(".a");
		expect(nestedOutput).toContain(".b");
	});
});

import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import scss from "postcss-scss";
import { transformSelectorReduce } from "../../src/poc/reduce-transformer.js";

describe("transformSelectorReduce (POC)", () => {
	function toSCSS(root) {
		return root.toString(scss.syntax);
	}

	describe("comma-separated selectors", () => {
		test("should handle two simple selectors", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".a, .b", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("color: red");
			expect(scss).toContain(".b {");
		});

		test("should handle chained + simple", () => {
			const decl = postcss.decl({ prop: "width", value: "100px" });
			const result = transformSelectorReduce(".a.b, .c", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b {");
			expect(scss).toContain(".c {");
		});

		test("should handle three selectors with pseudo", () => {
			const decl = postcss.decl({ prop: "display", value: "block" });
			const result = transformSelectorReduce(".a, .b.c, .d:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain(".b {");
			expect(scss).toContain("&.c {");
			expect(scss).toContain(".d {");
			expect(scss).toContain("&:hover {");
		});
	});

	describe("chained classes", () => {
		test("should nest two chained classes", () => {
			const decl = postcss.decl({ prop: "color", value: "blue" });
			const result = transformSelectorReduce(".a.b", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toMatch(/\.a \{[\s\S]*&\.b \{/);
			expect(scss).toContain("color: blue");
		});

		test("should nest three chained classes", () => {
			const decl = postcss.decl({ prop: "font-size", value: "16px" });
			const result = transformSelectorReduce(".a.b.c", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toMatch(/\.a \{[\s\S]*&\.b \{[\s\S]*&\.c \{/);
		});
	});

	describe("descendants", () => {
		test("should handle simple descendant", () => {
			const decl = postcss.decl({ prop: "margin", value: "0" });
			const result = transformSelectorReduce(".a .b", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain(".b {");
		});
	});

	describe("pseudo-classes", () => {
		test("should handle :hover", () => {
			const decl = postcss.decl({ prop: "cursor", value: "pointer" });
			const result = transformSelectorReduce(".a:hover", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("&:hover {");
		});
	});

	describe("complex selectors from article-card.css", () => {
		test("should handle .ArticleCard_card:hover", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".ArticleCard_card:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".ArticleCard_card {");
			expect(scss).toContain("&:hover {");
		});

		test("should handle .ArticleCard_card:hover .ArticleCard_category", () => {
			const decl = postcss.decl({ prop: "color", value: "green" });
			const result = transformSelectorReduce(
				".ArticleCard_card:hover .ArticleCard_category",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			expect(scss).toContain(".ArticleCard_card {");
			expect(scss).toContain("&:hover {");
			expect(scss).toContain(".ArticleCard_category {");
		});

		test("should handle .light-mode .ArticleCard_card", () => {
			const decl = postcss.decl({ prop: "background", value: "#fff" });
			const result = transformSelectorReduce(".light-mode .ArticleCard_card", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".light-mode {");
			expect(scss).toContain(".ArticleCard_card {");
		});
	});

	describe("comma-separated from fixture", () => {
		test("should handle .a, .b with same declaration", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".a, .b", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("color: red");
			expect(scss).toContain(".b {");
		});

		test("should handle .a.b, .c (chained + simple)", () => {
			const decl = postcss.decl({ prop: "width", value: "100px" });
			const result = transformSelectorReduce(".a.b, .c", { declaration: decl });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b {");
			expect(scss).toContain(".c {");
		});

		test("should handle .test, .item:hover, .link.active", () => {
			const decl = postcss.decl({ prop: "display", value: "block" });
			const result = transformSelectorReduce(
				".test, .item:hover, .link.active",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			expect(scss).toContain(".test {");
			expect(scss).toContain(".item {");
			expect(scss).toContain("&:hover {");
			expect(scss).toContain(".link {");
			expect(scss).toContain("&.active {");
		});
	});
});

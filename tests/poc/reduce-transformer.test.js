import { describe, expect, test } from "bun:test";

import postcss from "postcss";
import scss from "postcss-scss";
import {
	transformCSS,
	transformRule,
	transformSelectorReduce,
} from "../../src/poc/reduce-transformer.js";

describe("transformSelectorReduce (POC)", () => {
	function toSCSS(root) {
		return root.toString(scss.syntax);
	}

	describe("comma-separated selectors", () => {
		test("should handle two simple selectors (grouped)", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".a, .b", { declaration: decl });
			const scss = toSCSS(result);

			// Grouped: .a, .b { ... }
			expect(scss).toContain(".a, .b");
			expect(scss).toContain("color: red");
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
		test("should handle .a, .b with same declaration (grouped)", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".a, .b", { declaration: decl });
			const scss = toSCSS(result);

			// Grouped: .a, .b { ... }
			expect(scss).toContain(".a, .b");
			expect(scss).toContain("color: red");
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

	describe("multiple declarations per rule", () => {
		test("should handle two declarations", () => {
			const declarations = [
				postcss.decl({ prop: "color", value: "blue" }),
				postcss.decl({ prop: "background", value: "white" }),
			];
			const result = transformSelectorReduce(".a.b", { declarations });
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b {");
			expect(scss).toContain("color: blue");
			expect(scss).toContain("background: white");
		});

		test("should handle four declarations", () => {
			const declarations = [
				postcss.decl({ prop: "color", value: "blue" }),
				postcss.decl({ prop: "background", value: "white" }),
				postcss.decl({ prop: "padding", value: "10px" }),
				postcss.decl({ prop: "margin", value: "0" }),
			];
			const result = transformSelectorReduce(".a.b", { declarations });
			const scss = toSCSS(result);

			expect(scss).toContain("color: blue");
			expect(scss).toContain("background: white");
			expect(scss).toContain("padding: 10px");
			expect(scss).toContain("margin: 0");
		});

		test("should handle multiple declarations with comma-separated selectors", () => {
			const declarations = [
				postcss.decl({ prop: "width", value: "100%" }),
				postcss.decl({ prop: "height", value: "auto" }),
				postcss.decl({ prop: "display", value: "block" }),
			];
			const result = transformSelectorReduce(".c, .d:hover", { declarations });
			const scss = toSCSS(result);

			expect(scss).toContain(".c {");
			expect(scss).toContain(".d {");
			expect(scss).toContain("&:hover {");
			expect(scss).toContain("width: 100%");
			expect(scss).toContain("height: auto");
			expect(scss).toContain("display: block");
		});
	});

	describe("transformRule function", () => {
		test("should transform a PostCSS Rule with multiple declarations", () => {
			const rule = postcss.rule({
				selector: ".a.b",
				nodes: [
					postcss.decl({ prop: "color", value: "blue" }),
					postcss.decl({ prop: "background", value: "white" }),
				],
			});
			const result = transformRule(rule);
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b {");
			expect(scss).toContain("color: blue");
			expect(scss).toContain("background: white");
		});
	});

	describe("transformCSS function (from fixture files)", () => {
		test("should transform multiple-declarations.css fixture", () => {
			const css = `
				.a.b {
				  color: blue;
				  background: white;
				  padding: 10px;
				}
			`;
			const result = transformCSS(css);

			expect(result).toContain(".a {");
			expect(result).toContain("&.b {");
			expect(result).toContain("color: blue");
			expect(result).toContain("background: white");
			expect(result).toContain("padding: 10px");
		});

		test("should transform comma-separated with multiple declarations", () => {
			const css = `
				.c, .d:hover {
				  width: 100%;
				  height: auto;
				  display: block;
				}
			`;
			const result = transformCSS(css);

			expect(result).toContain(".c {");
			expect(result).toContain(".d {");
			expect(result).toContain("&:hover {");
			expect(result).toContain("width: 100%");
			expect(result).toContain("height: auto");
			expect(result).toContain("display: block");
		});

		test("should transform nested pattern with multiple declarations", () => {
			const css = `
				.container .item {
				  font-size: 16px;
				  line-height: 1.5;
				  color: #333;
				}
			`;
			const result = transformCSS(css);

			expect(result).toContain(".container {");
			expect(result).toContain(".item {");
			expect(result).toContain("font-size: 16px");
			expect(result).toContain("line-height: 1.5");
			expect(result).toContain("color: #333");
		});

		test("should transform multiple rules from fixture file", () => {
			const css = `
				.a.b {
				  color: blue;
				  background: white;
				}

				.c, .d:hover {
				  width: 100%;
				  height: auto;
				}
			`;
			const result = transformCSS(css);

			// First rule
			expect(result).toContain(".a {");
			expect(result).toContain("&.b {");
			expect(result).toContain("color: blue");
			expect(result).toContain("background: white");

			// Second rule
			expect(result).toContain(".c {");
			expect(result).toContain(".d {");
			expect(result).toContain("&:hover {");
			expect(result).toContain("width: 100%");
			expect(result).toContain("height: auto");
		});
	});

	describe("LCP-based grouping", () => {
		test("should group .test .c, .test .d:hover at .test LCP", () => {
			const decl = postcss.decl({ prop: "width", value: "100%" });
			const result = transformSelectorReduce(".test .c, .test .d:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Should nest under .test
			expect(scss).toContain(".test {");
			expect(scss).toContain(".c, .d:hover");
			expect(scss).toContain("width: 100%");
		});

		test("should group .a:hover, .b:hover by structure at root", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".a:hover, .b:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Should group by structure: .a, .b { &:hover }
			expect(scss).toContain(".a, .b");
			expect(scss).toContain("&:hover");
			expect(scss).toContain("color: red");
		});

		test("should group .a.b, .a.c at .a LCP", () => {
			const decl = postcss.decl({ prop: "display", value: "block" });
			const result = transformSelectorReduce(".a.b, .a.c", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Should nest under .a with chained classes
			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b, &.c");
			expect(scss).toContain("display: block");
		});

		test("should group .a:hover, .a:focus at .a LCP with & prefix", () => {
			const decl = postcss.decl({ prop: "color", value: "blue" });
			const result = transformSelectorReduce(".a:hover, .a:focus", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Should nest under .a with &:hover, &:focus
			expect(scss).toContain(".a {");
			expect(scss).toContain("&:hover, &:focus");
			expect(scss).toContain("color: blue");
		});

		test("should handle complex LCP with multiple descendants", () => {
			const decl = postcss.decl({ prop: "margin", value: "0" });
			const result = transformSelectorReduce(
				".container .item .a, .container .item .b",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			// Should nest under .container .item
			expect(scss).toContain(".container {");
			expect(scss).toContain(".item {");
			expect(scss).toContain(".a, .b");
			expect(scss).toContain("margin: 0");
		});
	});
});

describe("Edge Cases - Phase 0: Key encoding with colons", () => {
	function toSCSS(root) {
		return root.toString(scss.syntax);
	}

	describe("attribute selectors with colons in values", () => {
		test("should handle [href^='https://']", () => {
			const decl = postcss.decl({ prop: "color", value: "blue" });
			const result = transformSelectorReduce('[href^="https://"]', {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain('[href^="https://"]');
			expect(scss).toContain("color: blue");
		});

		test("should handle multiple attributes with colons", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(
				'[href^="https://"], [src^="http://"]',
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			expect(scss).toContain('[href^="https://"]');
			expect(scss).toContain('[src^="http://"]');
			expect(scss).toContain("color: red");
		});
	});

	describe("pseudo-elements with double colons", () => {
		test("should handle ::before", () => {
			const decl = postcss.decl({ prop: "content", value: '""' });
			const result = transformSelectorReduce(".element::before", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".element {");
			expect(scss).toContain("&::before");
			expect(scss).toContain('content: ""');
		});

		test("should handle ::after", () => {
			const decl = postcss.decl({ prop: "content", value: '""' });
			const result = transformSelectorReduce(".element::after", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".element {");
			expect(scss).toContain("&::after");
			expect(scss).toContain('content: ""');
		});

		test("should handle grouped pseudo-elements", () => {
			const decl = postcss.decl({ prop: "display", value: "block" });
			const result = transformSelectorReduce(".a::before, .b::before", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".a, .b");
			expect(scss).toContain("&::before");
		});
	});

	describe(":not() with complex selectors", () => {
		test("should handle :not() with attribute containing colon", () => {
			const decl = postcss.decl({ prop: "color", value: "gray" });
			const result = transformSelectorReduce(':not([href^="https://"])', {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain(':not([href^="https://"])');
			expect(output).toContain("color: gray");
		});

		test("should handle :not() with multiple classes", () => {
			const decl = postcss.decl({ prop: "display", value: "none" });
			const result = transformSelectorReduce(".a:not(.b)", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain(":not(.b)");
			expect(output).toContain("display: none");
		});
	});

	describe("mixed edge cases", () => {
		test("should handle attribute with descendant", () => {
			const decl = postcss.decl({ prop: "cursor", value: "pointer" });
			const result = transformSelectorReduce(
				'[data-url="https://example.com"]:hover',
				{
					declaration: decl,
				},
			);
			const scss = toSCSS(result);

			expect(scss).toContain('[data-url="https://example.com"]');
			expect(scss).toContain("&:hover");
		});

		test("should handle pseudo-element with pseudo-class", () => {
			const decl = postcss.decl({ prop: "opacity", value: "0" });
			const result = transformSelectorReduce(".button:hover::before", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".button {");
			expect(scss).toContain("&:hover");
			expect(scss).toContain("&::before");
		});
	});
});

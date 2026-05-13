/**
 * Transformer tests using parameterized testing patterns.
 *
 * Tests the LCP-based CSS-to-SCSS transformation logic.
 */

import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import {
	transformCSS,
	transformRule,
	transformSelectorReduce,
} from "../../src/core/transformer.js";
import { decl, toSCSS, transformToSCSS } from "./helpers.js";

describe("transformSelectorReduce", () => {
	describe("comma-separated selectors", () => {
		test.each([
			{
				expects: [".a, .b", "color: red"],
				prop: "color",
				selector: ".a, .b",
				value: "red",
			},
			{
				expects: [".a {", "&.b {", ".c {"],
				prop: "width",
				selector: ".a.b, .c",
				value: "100px",
			},
			{
				expects: [".a {", ".b {", "&.c {", ".d {", "&:hover {"],
				prop: "display",
				selector: ".a, .b.c, .d:hover",
				value: "block",
			},
		])("should handle $selector", ({ selector, prop, value, expects }) => {
			const scss = transformToSCSS(
				selector,
				decl(prop, value),
				transformSelectorReduce,
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("chained classes", () => {
		test.each([
			{
				prop: "color",
				regex: /\.a \{[\s\S]*&\.b \{/,
				selector: ".a.b",
				value: "blue",
			},
			{
				prop: "font-size",
				regex: /\.a \{[\s\S]*&\.b \{[\s\S]*&\.c \{/,
				selector: ".a.b.c",
				value: "16px",
			},
		])("should nest $selector", ({ selector, prop, value, regex }) => {
			const scss = transformToSCSS(
				selector,
				decl(prop, value),
				transformSelectorReduce,
			);
			expect(scss).toMatch(regex);
			expect(scss).toContain(`${prop}: ${value}`);
		});
	});

	describe("descendants", () => {
		test.each([
			{
				expects: [".a {", ".b {"],
				prop: "margin",
				selector: ".a .b",
				value: "0",
			},
			{
				expects: [".x {", ".y {", ".z {"],
				prop: "padding",
				selector: ".x .y .z",
				value: "5px",
			},
		])("should handle $selector", ({ selector, prop, value, expects }) => {
			const scss = transformToSCSS(
				selector,
				decl(prop, value),
				transformSelectorReduce,
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("pseudo-classes", () => {
		test.each([
			{ expects: [".a {", "&:hover {"], selector: ".a:hover" },
			{ expects: [".btn {", "&:active {"], selector: ".btn:active" },
			{ expects: [".link {", "&:focus {"], selector: ".link:focus" },
		])("should handle $selector", ({ selector, expects }) => {
			const scss = transformToSCSS(
				selector,
				decl("cursor", "pointer"),
				transformSelectorReduce,
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("complex selectors from article-card.css", () => {
		test.each([
			{
				expects: [".ArticleCard_card {", "&:hover {"],
				selector: ".ArticleCard_card:hover",
			},
			{
				expects: [
					".ArticleCard_card {",
					"&:hover {",
					".ArticleCard_category {",
				],
				selector: ".ArticleCard_card:hover .ArticleCard_category",
			},
			{
				expects: [".light-mode {", ".ArticleCard_card {"],
				selector: ".light-mode .ArticleCard_card",
			},
		])("should handle $selector", ({ selector, expects }) => {
			const scss = transformToSCSS(
				selector,
				decl("color", selector.includes("light-mode") ? "green" : "red"),
				transformSelectorReduce,
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("comma-separated from fixture", () => {
		test.each([
			{ expects: [".a, .b"], selector: ".a, .b" },
			{ expects: [".a {", "&.b {", ".c {"], selector: ".a.b, .c" },
			{
				expects: [".test {", ".item {", "&:hover {", ".link {", "&.active {"],
				selector: ".test, .item:hover, .link.active",
			},
		])("should handle $selector", ({ selector, expects }) => {
			const scss = transformToSCSS(
				selector,
				decl("display", "block"),
				transformSelectorReduce,
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("multiple declarations per rule", () => {
		test.each([
			{
				declarations: [
					{ prop: "color", value: "blue" },
					{ prop: "background", value: "white" },
				],
				expects: [".a {", "&.b {", "color: blue", "background: white"],
				selector: ".a.b",
			},
			{
				declarations: [
					{ prop: "width", value: "100%" },
					{ prop: "height", value: "auto" },
					{ prop: "display", value: "block" },
				],
				expects: ["width: 100%", "height: auto", "display: block"],
				selector: ".c, .d:hover",
			},
		])("should handle $selector with multiple declarations", ({
			selector,
			declarations,
			expects,
		}) => {
			const decls = declarations.map((d) => postcss.decl(d));
			const scss = transformToSCSS(selector, null, (s) =>
				transformSelectorReduce(s, { declarations: decls }),
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("transformRule function", () => {
		test("should transform a PostCSS Rule with multiple declarations", () => {
			const rule = postcss.rule({
				nodes: [
					postcss.decl({ prop: "color", value: "blue" }),
					postcss.decl({ prop: "background", value: "white" }),
				],
				selector: ".a.b",
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
		test.each([
			{
				css: `
				.a.b {
					color: blue;
					background: white;
					padding: 10px;
				}`,
				expects: [
					".a {",
					"&.b {",
					"color: blue",
					"background: white",
					"padding: 10px",
				],
				name: "multiple-declarations",
			},
			{
				css: `
				.a, .b {
					color: red;
				}`,
				expects: [".a, .b", "color: red"],
				name: "comma-separated",
			},
			{
				css: `
				.test .c, .test .d:hover {
					color: red;
				}`,
				expects: [".test {", ".c, .d:hover"],
				name: "nested-descendants",
			},
		])("should transform $name fixture", ({ css, expects }) => {
			const result = transformCSS(css);
			for (const expected of expects) {
				expect(result).toContain(expected);
			}
		});
	});

	describe("combinators (> + ~)", () => {
		test.each([
			{ expects: ["#main > .content"], selector: "#main > .content" },
			{ expects: [".header + .content"], selector: ".header + .content" },
			{ expects: [".section ~ .footer"], selector: ".section ~ .footer" },
		])("should handle $selector as flat output", ({ selector, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl("display", "block"),
			});
			const output = result.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("attribute selectors", () => {
		test.each([
			{ expects: ['[type="text"]'], selector: '[type="text"]' },
			{ expects: ['[data-foo="bar"]'], selector: '[data-foo="bar"]' },
			{ expects: ['[href^="https://"]'], selector: '[href^="https://"]' },
		])("should handle $selector", ({ selector, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl("display", "block"),
			});
			const output = result.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe(":not() pseudo-class", () => {
		test.each([
			{ expects: [":not(.excluded)"], selector: ":not(.excluded)" },
			{ expects: [":not([disabled])"], selector: ":not([disabled])" },
			{
				expects: [':not([href^="https://"])'],
				selector: ':not([href^="https://"])',
			},
		])("should handle $selector", ({ selector, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl("display", "block"),
			});
			const output = result.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("pseudo-elements", () => {
		test.each([
			{ expects: [".icon {", "&::before {"], selector: ".icon::before" },
			{ expects: [".icon {", "&::after {"], selector: ".icon::after" },
			{ expects: [".a {", "&.b", "&::before"], selector: ".a.b::before" },
		])("should handle $selector", ({ selector, expects }) => {
			const scss = transformToSCSS(
				selector,
				decl("content", '"x"'),
				transformSelectorReduce,
			);
			for (const expected of expects) {
				expect(scss).toContain(expected);
			}
		});
	});

	describe("error handling", () => {
		test.each([
			{ description: "empty string", selector: "" },
			{ description: "whitespace only", selector: "   " },
		])("should throw on $description", ({ selector }) => {
			expect(() =>
				transformSelectorReduce(selector, {
					declaration: decl("color", "red"),
				}),
			).toThrow();
		});

		test("should throw when declarations option is missing", () => {
			expect(() => transformSelectorReduce(".a")).toThrow();
		});
	});
});

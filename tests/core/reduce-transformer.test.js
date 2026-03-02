/**
 * Reduce transformer tests using parameterized testing patterns.
 *
 * Tests the LCP-based CSS-to-SCSS transformation logic.
 */

import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import {
	transformCSS,
	transformRule,
	transformSelectorReduce,
} from "../../src/core/reduce-transformer.js";
import { decl, toSCSS, transformToSCSS } from "./helpers.js";

describe("transformSelectorReduce (POC)", () => {
	describe("comma-separated selectors", () => {
		test.each([
			{
				selector: ".a, .b",
				prop: "color",
				value: "red",
				expects: [".a, .b", "color: red"],
			},
			{
				selector: ".a.b, .c",
				prop: "width",
				value: "100px",
				expects: [".a {", "&.b {", ".c {"],
			},
			{
				selector: ".a, .b.c, .d:hover",
				prop: "display",
				value: "block",
				expects: [".a {", ".b {", "&.c {", ".d {", "&:hover {"],
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
				selector: ".a.b",
				prop: "color",
				value: "blue",
				regex: /\.a \{[\s\S]*&\.b \{/,
			},
			{
				selector: ".a.b.c",
				prop: "font-size",
				value: "16px",
				regex: /\.a \{[\s\S]*&\.b \{[\s\S]*&\.c \{/,
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
				selector: ".a .b",
				prop: "margin",
				value: "0",
				expects: [".a {", ".b {"],
			},
			{
				selector: ".x .y .z",
				prop: "padding",
				value: "5px",
				expects: [".x {", ".y {", ".z {"],
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
			{ selector: ".a:hover", expects: [".a {", "&:hover {"] },
			{ selector: ".btn:active", expects: [".btn {", "&:active {"] },
			{ selector: ".link:focus", expects: [".link {", "&:focus {"] },
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
				selector: ".ArticleCard_card:hover",
				expects: [".ArticleCard_card {", "&:hover {"],
			},
			{
				selector: ".ArticleCard_card:hover .ArticleCard_category",
				expects: [
					".ArticleCard_card {",
					"&:hover {",
					".ArticleCard_category {",
				],
			},
			{
				selector: ".light-mode .ArticleCard_card",
				expects: [".light-mode {", ".ArticleCard_card {"],
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
			{ selector: ".a, .b", expects: [".a, .b"] },
			{ selector: ".a.b, .c", expects: [".a {", "&.b {", ".c {"] },
			{
				selector: ".test, .item:hover, .link.active",
				expects: [".test {", ".item {", "&:hover {", ".link {", "&.active {"],
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
				selector: ".a.b",
				declarations: [
					{ prop: "color", value: "blue" },
					{ prop: "background", value: "white" },
				],
				expects: [".a {", "&.b {", "color: blue", "background: white"],
			},
			{
				selector: ".c, .d:hover",
				declarations: [
					{ prop: "width", value: "100%" },
					{ prop: "height", value: "auto" },
					{ prop: "display", value: "block" },
				],
				expects: ["width: 100%", "height: auto", "display: block"],
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
		test.each([
			{
				name: "multiple-declarations",
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
			},
			{
				name: "comma-separated",
				css: `
				.a, .b {
					color: red;
				}`,
				expects: [".a, .b", "color: red"],
			},
			{
				name: "nested-descendants",
				css: `
				.test .c, .test .d:hover {
					color: red;
				}`,
				expects: [".test {", ".c, .d:hover"],
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
			{ selector: "#main > .content", expects: ["#main > .content"] },
			{ selector: ".header + .content", expects: [".header + .content"] },
			{ selector: ".section ~ .footer", expects: [".section ~ .footer"] },
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
			{ selector: '[type="text"]', expects: ['[type="text"]'] },
			{ selector: '[data-foo="bar"]', expects: ['[data-foo="bar"]'] },
			{ selector: '[href^="https://"]', expects: ['[href^="https://"]'] },
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
			{ selector: ":not(.excluded)", expects: [":not(.excluded)"] },
			{ selector: ":not([disabled])", expects: [":not([disabled])"] },
			{
				selector: ':not([href^="https://"])',
				expects: [':not([href^="https://"])'],
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
			{ selector: ".icon::before", expects: [".icon {", "&::before {"] },
			{ selector: ".icon::after", expects: [".icon {", "&::after {"] },
			{ selector: ".a.b::before", expects: [".a {", "&.b", "&::before"] },
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
			{ selector: "", description: "empty string" },
			{ selector: "   ", description: "whitespace only" },
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

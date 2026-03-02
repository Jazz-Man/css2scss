/**
 * Edge case tests using parameterized testing patterns.
 *
 * Demonstrates reduced boilerplate through:
 * - Shared test helpers
 * - Parameterized test cases
 * - Data-driven test structure
 */

import { describe, expect, test } from "bun:test";
import { transformSelectorReduce } from "../../src/core/reduce-transformer.js";
import { decl, toSCSS, transformToSCSS } from "./helpers.js";

describe("Edge Cases - Comprehensive Coverage", () => {
	describe("Universal selector (*)", () => {
		test.each([
			{
				selector: "*",
				prop: "margin",
				value: "0",
				expects: ["* {", "margin: 0"],
			},
			{
				selector: ".container *",
				prop: "padding",
				value: "10px",
				expects: [".container {", "* {", "padding: 10px"],
			},
			{
				selector: "*:hover",
				prop: "display",
				value: "block",
				expects: ["* {", "&:hover", "display: block"],
			},
			{
				selector: "*:hover, *:focus",
				prop: "color",
				value: "red",
				expects: ["* {", "&:hover, &:focus"],
			},
		])("should handle $selector", ({ selector, prop, value, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = selector === "*" ? result.toString() : toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Empty and minimal selectors", () => {
		test.each(["", "   "])("should throw on '%s'", (selector) => {
			expect(() =>
				transformSelectorReduce(selector, {
					declaration: decl("color", "red"),
				}),
			).toThrow();
		});
	});

	describe("Multiple pseudo-classes", () => {
		test.each([
			{
				selector: ".button:hover:focus",
				prop: "opacity",
				value: "0.5",
				expects: [".button {", "&:hover {", "&:focus {"],
			},
			{
				selector: ".a:hover:focus, .b:hover:active",
				prop: "cursor",
				value: "pointer",
				expects: [".a, .b", "&:hover"],
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

	describe("Complex attribute selectors", () => {
		test.each([
			{
				selector: '[data-foo][data-bar="baz"]',
				prop: "border",
				value: "1px solid red",
				expects: ["[data-foo]", '[data-bar="baz"]'],
			},
			{
				selector: ":not([data-hidden])",
				prop: "display",
				value: "none",
				expects: [":not([data-hidden])"],
			},
			{
				selector: '[data-url^="https://example.com/path"]',
				prop: "content",
				value: '""',
				expects: ['[data-url^="https://example.com/path"]'],
			},
		])("should handle $selector", ({ selector, prop, value, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = result.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Deep nesting levels", () => {
		test.each([
			{
				selector: ".a .b .c .d .e",
				prop: "color",
				value: "blue",
				expects: [".a {", ".b {", ".c {", ".d {", ".e {"],
			},
			{
				selector: ".one .two .three .four:hover",
				prop: "opacity",
				value: "1",
				expects: [".one {", ".two {", ".three {", ".four {", "&:hover"],
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

	describe("Chained classes with pseudo-elements", () => {
		test.each([
			{
				selector: ".a.b::before",
				prop: "content",
				value: '"x"',
				expects: [".a {", "&.b", "&::before"],
			},
			{
				selector: ".a.b.c::after",
				prop: "content",
				value: '"y"',
				expects: [".a {", "&.b", "&.c", "&::after"],
			},
			{
				selector: ".a.b::before, .c.d::after",
				prop: "opacity",
				value: "0.8",
				expects: [".a, .c", "&.b, &.d", "&::before, &::after"],
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

	describe("ID selectors with combinators", () => {
		test.each([
			{
				selector: "#main > .content",
				prop: "width",
				value: "100%",
				flat: true,
				expects: ["#main > .content"],
			},
			{
				selector: "#main + .sidebar",
				prop: "float",
				value: "left",
				flat: true,
				expects: ["#main + .sidebar"],
			},
			{
				selector: "#container .item",
				prop: "flex",
				value: "1",
				flat: false,
				expects: ["#container {", ".item {"],
			},
		])("should handle $selector", ({
			selector,
			prop,
			value,
			flat,
			expects,
		}) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = flat ? result.toString() : toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Mixed selector types", () => {
		test.each([
			{
				selector: "div.highlight",
				prop: "display",
				value: "inline",
				flat: true,
				expects: ["div {", "&.highlight"],
			},
			{
				selector: "header#main",
				prop: "position",
				value: "absolute",
				flat: false,
				expects: ["header {", "&#main"],
			},
			{
				selector: "a.link:hover",
				prop: "cursor",
				value: "pointer",
				flat: false,
				expects: ["a {", "&.link", "&:hover"],
			},
		])("should handle $selector", ({ selector, prop, value, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe(":not() with combinators", () => {
		test.each([
			{
				selector: ":not(.parent) .child",
				prop: "color",
				value: "red",
				expects: [":not(.parent) {", ".child {"],
			},
			{
				selector: ".container > :not(.excluded)",
				prop: "margin",
				value: "0",
				flat: true,
				expects: [".container > :not(.excluded)"],
			},
		])("should handle $selector", ({
			selector,
			prop,
			value,
			flat = false,
			expects,
		}) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = flat ? result.toString() : toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Stress tests - multiple selectors", () => {
		test("should handle 10 different selectors", () => {
			const selector = ".a1, .a2, .a3, .a4, .a5, .a6, .a7, .a8, .a9, .a10";
			const result = transformSelectorReduce(selector, {
				declaration: decl("color", "blue"),
			});
			const output = result.toString();

			for (let i = 1; i <= 10; i++) {
				expect(output).toContain(`.a${i}`);
			}
			expect(output).toContain("color: blue");
		});

		test("should handle selectors with varying depths", () => {
			const selector = ".a, .b .c, .d .e .f, .g";
			const result = transformSelectorReduce(selector, {
				declaration: decl("width", "auto"),
			});
			const output = result.toString();

			expect(output).toContain(".a, .g");
			expect(output).toContain(".b");
			expect(output).toContain(".c");
			expect(output).toContain(".d");
			expect(output).toContain(".e");
			expect(output).toContain(".f");
		});
	});

	describe("Real-world patterns", () => {
		test.each([
			{
				selector: ".block__element, .block--modifier",
				prop: "display",
				value: "flex",
				flat: true,
				expects: [".block__element, .block--modifier {"],
			},
			{
				selector: ".flex, .items-center, .justify-between",
				prop: "display",
				value: "flex",
				flat: true,
				expects: [".flex, .items-center, .justify-between {"],
			},
			{
				selector: ".btn:hover, .btn:focus, .btn:active",
				prop: "color",
				value: "red",
				expects: [".btn {", "&:hover, &:focus, &:active"],
			},
			{
				selector: ".card:hover .title, .card:focus .title",
				prop: "opacity",
				value: "0.8",
				expects: [".card {", ".title {"],
			},
		])("should handle $selector", ({
			selector,
			prop,
			value,
			flat = false,
			expects,
		}) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = flat ? result.toString() : toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Corner cases from ULTRATHINK review", () => {
		test("should handle selector ending with combinator", () => {
			const result = transformSelectorReduce(".a >", {
				declaration: decl("color", "red"),
			});
			expect(result.toString()).toBeTruthy();
		});

		test.each([
			{
				selector: ".a  .b",
				prop: "color",
				value: "blue",
				expects: [".a {", ".b {"],
			},
			{
				selector: ".a\t.b",
				prop: "padding",
				value: "0",
				expects: [".a", ".b"],
			},
		])("should handle whitespace variations", ({
			selector,
			prop,
			value,
			expects,
		}) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = selector.includes("\t")
				? result.toString()
				: toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Attribute selector edge cases", () => {
		test.each([
			{
				selector: "[type='text']",
				prop: "content",
				value: "''",
				expects: ["[type='text']"],
			},
			{
				selector: "[disabled]",
				prop: "display",
				value: "none",
				expects: ["[disabled]"],
			},
			{
				selector: '[class*="icon-"]',
				prop: "color",
				value: "green",
				expects: ['[class*="icon-"]'],
			},
			{
				selector: '[class$="-btn"]',
				prop: "font-weight",
				value: "bold",
				expects: ['[class$="-btn"]'],
			},
		])("should handle $selector", ({ selector, prop, value, expects }) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = result.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});

	describe("Pseudo-class edge cases", () => {
		test.each([
			{
				selector: ".item:first-child",
				prop: "margin-top",
				value: "0",
				expects: [".item {", "&:first-child {"],
			},
			{
				selector: "li:nth-child(2n)",
				prop: "background",
				value: "gray",
				expects: ["li {", "&:nth-child(2n) {"],
			},
			{
				selector: ".container:has(.sidebar)",
				prop: "display",
				value: "grid",
				expects: [".container {", "&:has(.sidebar) {"],
			},
			{
				selector: ":is(.a, .b, .c)",
				prop: "color",
				value: "red",
				flat: true,
				expects: [":is(.a, .b, .c)"],
			},
			{
				selector: ":where(.a, .b)",
				prop: "opacity",
				value: "0.5",
				flat: true,
				expects: [":where(.a, .b)"],
			},
		])("should handle $selector", ({
			selector,
			prop,
			value,
			flat = false,
			expects,
		}) => {
			const result = transformSelectorReduce(selector, {
				declaration: decl(prop, value),
			});
			const output = flat ? result.toString() : toSCSS(result);
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});
	});
});

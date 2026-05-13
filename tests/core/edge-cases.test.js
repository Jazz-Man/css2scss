/**
 * Edge case tests using parameterized testing patterns.
 *
 * Demonstrates reduced boilerplate through:
 * - Shared test helpers
 * - Parameterized test cases
 * - Data-driven test structure
 */

import { describe, expect, test } from "bun:test";
import { transformSelectorReduce } from "../../src/core/transformer.js";
import { decl, toSCSS, transformToSCSS } from "./helpers.js";

describe("Edge Cases - Comprehensive Coverage", () => {
	describe("Universal selector (*)", () => {
		test.each([
			{
				expects: ["* {", "margin: 0"],
				prop: "margin",
				selector: "*",
				value: "0",
			},
			{
				expects: [".container {", "* {", "padding: 10px"],
				prop: "padding",
				selector: ".container *",
				value: "10px",
			},
			{
				expects: ["* {", "&:hover", "display: block"],
				prop: "display",
				selector: "*:hover",
				value: "block",
			},
			{
				expects: ["* {", "&:hover, &:focus"],
				prop: "color",
				selector: "*:hover, *:focus",
				value: "red",
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
				expects: [".button {", "&:hover {", "&:focus {"],
				prop: "opacity",
				selector: ".button:hover:focus",
				value: "0.5",
			},
			{
				expects: [".a, .b", "&:hover"],
				prop: "cursor",
				selector: ".a:hover:focus, .b:hover:active",
				value: "pointer",
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
				expects: ["[data-foo]", '[data-bar="baz"]'],
				prop: "border",
				selector: '[data-foo][data-bar="baz"]',
				value: "1px solid red",
			},
			{
				expects: [":not([data-hidden])"],
				prop: "display",
				selector: ":not([data-hidden])",
				value: "none",
			},
			{
				expects: ['[data-url^="https://example.com/path"]'],
				prop: "content",
				selector: '[data-url^="https://example.com/path"]',
				value: '""',
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
				expects: [".a {", ".b {", ".c {", ".d {", ".e {"],
				prop: "color",
				selector: ".a .b .c .d .e",
				value: "blue",
			},
			{
				expects: [".one {", ".two {", ".three {", ".four {", "&:hover"],
				prop: "opacity",
				selector: ".one .two .three .four:hover",
				value: "1",
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
				expects: [".a {", "&.b", "&::before"],
				prop: "content",
				selector: ".a.b::before",
				value: '"x"',
			},
			{
				expects: [".a {", "&.b", "&.c", "&::after"],
				prop: "content",
				selector: ".a.b.c::after",
				value: '"y"',
			},
			{
				expects: [".a, .c", "&.b, &.d", "&::before, &::after"],
				prop: "opacity",
				selector: ".a.b::before, .c.d::after",
				value: "0.8",
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
				expects: ["#main > .content"],
				flat: true,
				prop: "width",
				selector: "#main > .content",
				value: "100%",
			},
			{
				expects: ["#main + .sidebar"],
				flat: true,
				prop: "float",
				selector: "#main + .sidebar",
				value: "left",
			},
			{
				expects: ["#container {", ".item {"],
				flat: false,
				prop: "flex",
				selector: "#container .item",
				value: "1",
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
				expects: ["div {", "&.highlight"],
				flat: true,
				prop: "display",
				selector: "div.highlight",
				value: "inline",
			},
			{
				expects: ["header {", "&#main"],
				flat: false,
				prop: "position",
				selector: "header#main",
				value: "absolute",
			},
			{
				expects: ["a {", "&.link", "&:hover"],
				flat: false,
				prop: "cursor",
				selector: "a.link:hover",
				value: "pointer",
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
				expects: [":not(.parent) {", ".child {"],
				prop: "color",
				selector: ":not(.parent) .child",
				value: "red",
			},
			{
				expects: [".container > :not(.excluded)"],
				flat: true,
				prop: "margin",
				selector: ".container > :not(.excluded)",
				value: "0",
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
				expects: [".block__element, .block--modifier {"],
				flat: true,
				prop: "display",
				selector: ".block__element, .block--modifier",
				value: "flex",
			},
			{
				expects: [".flex, .items-center, .justify-between {"],
				flat: true,
				prop: "display",
				selector: ".flex, .items-center, .justify-between",
				value: "flex",
			},
			{
				expects: [".btn {", "&:hover, &:focus, &:active"],
				prop: "color",
				selector: ".btn:hover, .btn:focus, .btn:active",
				value: "red",
			},
			{
				expects: [".card {", ".title {"],
				prop: "opacity",
				selector: ".card:hover .title, .card:focus .title",
				value: "0.8",
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
				expects: [".a {", ".b {"],
				prop: "color",
				selector: ".a  .b",
				value: "blue",
			},
			{
				expects: [".a", ".b"],
				prop: "padding",
				selector: ".a\t.b",
				value: "0",
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
				expects: ["[type='text']"],
				prop: "content",
				selector: "[type='text']",
				value: "''",
			},
			{
				expects: ["[disabled]"],
				prop: "display",
				selector: "[disabled]",
				value: "none",
			},
			{
				expects: ['[class*="icon-"]'],
				prop: "color",
				selector: '[class*="icon-"]',
				value: "green",
			},
			{
				expects: ['[class$="-btn"]'],
				prop: "font-weight",
				selector: '[class$="-btn"]',
				value: "bold",
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
				expects: [".item {", "&:first-child {"],
				prop: "margin-top",
				selector: ".item:first-child",
				value: "0",
			},
			{
				expects: ["li {", "&:nth-child(2n) {"],
				prop: "background",
				selector: "li:nth-child(2n)",
				value: "gray",
			},
			{
				expects: [".container {", "&:has(.sidebar) {"],
				prop: "display",
				selector: ".container:has(.sidebar)",
				value: "grid",
			},
			{
				expects: [":is(.a, .b, .c)"],
				flat: true,
				prop: "color",
				selector: ":is(.a, .b, .c)",
				value: "red",
			},
			{
				expects: [":where(.a, .b)"],
				flat: true,
				prop: "opacity",
				selector: ":where(.a, .b)",
				value: "0.5",
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

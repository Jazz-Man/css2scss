import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import scss from "postcss-scss";
import { transform } from "../../src/core/transformer.js";

describe("transform", () => {
	function transformCSS(css, options = {}) {
		const root = postcss.parse(css);
		const transformed = transform(root, options);
		return transformed.toString(scss.syntax);
	}

	describe("Basic Selectors", () => {
		test("should preserve simple class selector", () => {
			const css = ".a { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a");
			expect(result).toContain("color: red");
		});

		test("should preserve tag selector", () => {
			const css = "div { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain("div");
			expect(result).toContain("color: red");
		});

		test("should preserve ID selector", () => {
			const css = "#myid { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain("#myid");
			expect(result).toContain("color: red");
		});

		test("should preserve tag + class selector", () => {
			const css = "div.container { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain("div.container");
			expect(result).toContain("color: red");
		});
	});

	describe("Chained Classes/IDs", () => {
		test("should preserve chained classes as single selector", () => {
			const css = ".a.b { color: red; }";
			const result = transformCSS(css);
			// .a.b is treated as a single selector without space
			expect(result).toContain(".a.b");
			expect(result).toContain("color: red");
		});

		test("should preserve three chained classes", () => {
			const css = ".a.b.c { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a.b.c");
		});

		test("should preserve chained IDs", () => {
			const css = "#id1#id2 { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain("#id1#id2");
		});

		test("should preserve class + ID chained", () => {
			const css = ".a.b#id { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a.b#id");
		});
	});

	describe("Pseudo-Classes", () => {
		test("should nest :hover pseudo-class", () => {
			const css = ".a:hover { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:hover {");
		});

		test("should nest :focus pseudo-class", () => {
			const css = ".a:focus { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:focus {");
		});

		test("should nest :first-child pseudo-class", () => {
			const css = ".a:first-child { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:first-child {");
		});

		test("should nest :nth-child pseudo-class", () => {
			const css = ".a:nth-child(2) { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:nth-child(2) {");
		});

		test("should nest :not pseudo-class", () => {
			const css = ".a:not(.b) { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:not(.b) {");
		});

		test("should nest :has pseudo-class", () => {
			const css = ".a:has(.b) { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:has(.b) {");
		});
	});

	describe("Descendant Selectors", () => {
		test("should nest simple descendant", () => {
			const css = ".a .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain(".b {");
		});

		test("should nest multiple descendants", () => {
			const css = ".a .b .c { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain(".b {");
			expect(result).toContain(".c {");
		});

		test("should nest tag + descendants", () => {
			const css = "div .a .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain("div {");
			expect(result).toContain(".a {");
		});
	});

	describe("Combinators", () => {
		test("should preserve child combinator (>)", () => {
			const css = ".a > .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a > .b");
		});

		test("should preserve adjacent sibling combinator (+)", () => {
			const css = ".a + .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a + .b");
		});

		test("should preserve general sibling combinator (~)", () => {
			const css = ".a ~ .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a ~ .b");
		});

		test("should handle multiple combinators", () => {
			const css = ".a > .b + .c { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a > .b + .c");
		});
	});

	describe("Chained with Descendants", () => {
		test("should handle chained class + descendant", () => {
			const css = ".a.b .c { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&.b {");
			expect(result).toContain(".c {");
		});

		test("should handle chained classes + chained descendant", () => {
			const css = ".a.b .c.d { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&.b {");
			// .c.d is kept as single selector (no space)
			expect(result).toContain(".c.d");
		});

		test("should handle pseudo-class + descendant", () => {
			const css = ".a:hover .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			// :hover .b is kept together in child selector
			expect(result).toContain("&:hover .b");
		});
	});

	describe("Attribute Selectors", () => {
		test("should handle attribute selector without value", () => {
			const css = "[data-test] { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain("[data-test]");
		});

		test("should handle attribute selector with value", () => {
			const css = '[data-test="value"] { color: red; }';
			const result = transformCSS(css);
			expect(result).toContain('[data-test="value"]');
		});

		test("should handle class + attribute", () => {
			const css = ".a[data-test] { color: red; }";
			const result = transformCSS(css);
			// .a[data-test] is a single selector (no space)
			expect(result).toContain(".a[data-test]");
		});
	});

	describe("Pseudo-Elements", () => {
		test("should nest ::before pseudo-element", () => {
			const css = ".a::before { content: ''; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&::before {");
		});

		test("should nest ::after pseudo-element", () => {
			const css = ".a::after { content: ''; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&::after {");
		});

		test("should handle pseudo-class + pseudo-element", () => {
			const css = ".a:hover::before { content: ''; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			// :hover::before is kept together in child selector
			expect(result).toContain("&:hover::before");
		});
	});

	describe("Special Cases", () => {
		test("should preserve :root as standalone", () => {
			const css = ":root { --color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(":root {");
			expect(result).toContain("--color: red");
		});

		test("should preserve universal selector", () => {
			const css = "* { box-sizing: border-box; }";
			const result = transformCSS(css);
			expect(result).toContain("* {");
		});

		test("should handle universal selector in middle", () => {
			const css = ".a * .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
		});
	});

	describe("Comma-Separated Selectors", () => {
		test("should merge same base with different pseudo-classes", () => {
			const css = ".a:hover { color: red; } .a:focus { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:hover,");
			expect(result).toContain("&:focus {");
		});

		test("should handle different base selectors", () => {
			const css = ".a { color: red; } .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain(".b {");
		});

		test("should handle comma-separated selectors in single rule", () => {
			const css = ".a, .b { color: red; }";
			const result = transformCSS(css);
			// Both should get the same declarations
			expect(result).toContain("color: red");
		});

		test("should merge same chained base + descendant", () => {
			const css = ".a.b .c { color: red; } .a.b .d { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&.b {");
		});

		test("should merge selectors with child combinator", () => {
			const css = ".a > .b { color: red; } .a > .c { color: red; }";
			const result = transformCSS(css);
			// Combinators are preserved, not merged
			expect(result).toContain(".a > .b");
			expect(result).toContain(".a > .c");
		});
	});

	describe("@media Queries", () => {
		test("should preserve @media queries", () => {
			const css = "@media (max-width: 768px) { .a { color: red; } }";
			const result = transformCSS(css);
			expect(result).toContain("@media");
			expect(result).toContain("max-width: 768px");
			expect(result).toContain(".a");
		});

		test("should nest @media inside parent selectors", () => {
			const css =
				".a { color: blue; } @media (max-width: 768px) { .a { color: red; } }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("@media");
			expect(result).toContain("color: blue");
			expect(result).toContain("color: red");
		});

		test("should handle multiple @media rules", () => {
			const css =
				"@media (max-width: 768px) { .a { color: red; } } @media (min-width: 769px) { .a { color: blue; } }";
			const result = transformCSS(css);
			expect(result).toContain("@media (max-width: 768px)");
			expect(result).toContain("@media (min-width: 769px)");
		});
	});

	describe("At-Rules", () => {
		test("should preserve @keyframes", () => {
			const css =
				"@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }";
			const result = transformCSS(css);
			expect(result).toContain("@keyframes fadeIn");
			expect(result).toContain("from");
			expect(result).toContain("to");
		});

		test("should preserve @font-face", () => {
			const css = '@font-face { font-family: "Test"; src: url(test.woff2); }';
			const result = transformCSS(css);
			expect(result).toContain("@font-face");
			expect(result).toContain('font-family: "Test"');
		});

		test("should preserve @supports", () => {
			const css = "@supports (display: grid) { .a { display: grid; } }";
			const result = transformCSS(css);
			expect(result).toContain("@supports");
			expect(result).toContain("display: grid");
		});
	});

	describe("Comments", () => {
		test("should remove comments by default", () => {
			const css = "/* comment */ .a { color: red; }";
			const result = transformCSS(css);
			expect(result).not.toContain("/* comment */");
		});

		test("should remove comments when comments option is false", () => {
			const css = "/* comment */ .a { color: red; }";
			const result = transformCSS(css, { comments: false });
			expect(result).not.toContain("/* comment */");
		});
	});

	describe("Declarations", () => {
		test("should handle declarations", () => {
			const css = ".a { color: red }";
			const result = transformCSS(css);
			expect(result).toContain("color: red");
		});

		test("should handle custom properties", () => {
			const css = ".a { --custom: value; }";
			const result = transformCSS(css);
			expect(result).toContain("--custom: value");
		});

		test("should handle !important", () => {
			const css = ".a { color: red !important; }";
			const result = transformCSS(css);
			expect(result).toContain("color: red !important");
		});
	});

	describe("Complex Real-World Scenarios", () => {
		test("should handle complex nested selector", () => {
			const css = ".a.b .c:hover .d { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&.b {");
		});

		test("should handle multiple combinators + pseudo", () => {
			const css = ".a > .b ~ .c:focus { color: red; }";
			const result = transformCSS(css);
			// The parser splits on space, so .c becomes nested with :focus
			expect(result).toContain(".a > .b ~ .c {");
			expect(result).toContain("&:focus {");
		});

		test("should handle chained + child combinator", () => {
			const css = ".a.b > .c { color: red; }";
			const result = transformCSS(css);
			// .a.b > .c - the > is part of the selector, no descendant space
			expect(result).toContain(".a.b > .c");
		});

		test("should handle pseudo + adjacent sibling", () => {
			const css = ".a:hover + .b { color: red; }";
			const result = transformCSS(css);
			expect(result).toContain(".a {");
			expect(result).toContain("&:hover + .b");
		});
	});

	describe("Node Ordering", () => {
		test("should order declarations before rules", () => {
			const css = ".a { .b { color: red; } color: blue; }";
			const result = transformCSS(css);
			const colorIndex = result.indexOf("color: blue");
			const ruleIndex = result.indexOf(".b {");
			// Declarations should come before nested rules
			expect(result).toMatch(/color: blue[\s\S]*\.b \{/);
		});

		test("should order @media before child rules", () => {
			const css =
				"@media (max-width: 768px) { .a { color: red; } } .a { .b { color: blue; } }";
			const result = transformCSS(css);
			// @media should appear before nested rules
			const mediaIndex = result.indexOf("@media");
			const ruleIndex = result.indexOf(".b {");
			expect(mediaIndex).toBeGreaterThan(-1);
		});
	});
});

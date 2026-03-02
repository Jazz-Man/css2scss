import { describe, expect, test } from "bun:test";

import postcss from "postcss";
import scss from "postcss-scss";
import { transformSelectorReduce } from "../../src/poc/reduce-transformer.js";

describe("Edge Cases - Comprehensive Coverage", () => {
	function toSCSS(root) {
		return root.toString(scss.syntax);
	}

	describe("Universal selector (*)", () => {
		test("should handle single universal selector", () => {
			const decl = postcss.decl({ prop: "margin", value: "0" });
			const result = transformSelectorReduce("*", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain("* {");
			expect(output).toContain("margin: 0");
		});

		test("should handle universal with descendant", () => {
			const decl = postcss.decl({ prop: "padding", value: "10px" });
			const result = transformSelectorReduce(".container *", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".container {");
			expect(scss).toContain("* {");
			expect(scss).toContain("padding: 10px");
		});

		test("should handle universal with pseudo-class", () => {
			const decl = postcss.decl({ prop: "display", value: "block" });
			const result = transformSelectorReduce("*:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain("* {");
			expect(scss).toContain("&:hover");
		});

		test("should group multiple universal selectors", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce("*:hover, *:focus", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain("* {");
			expect(scss).toContain("&:hover, &:focus");
		});
	});

	describe("Empty and minimal selectors", () => {
		test("should throw on empty selector string", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			expect(() => {
				transformSelectorReduce("", { declaration: decl });
			}).toThrow();
		});

		test("should handle whitespace-only selector gracefully", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			expect(() => {
				transformSelectorReduce("   ", { declaration: decl });
			}).toThrow();
		});
	});

	describe("Multiple pseudo-classes", () => {
		test("should handle multiple pseudo-classes on same element", () => {
			const decl = postcss.decl({ prop: "opacity", value: "0.5" });
			const result = transformSelectorReduce(".button:hover:focus", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".button {");
			expect(scss).toContain("&:hover {");
			expect(scss).toContain("&:focus {");
		});

		test("should handle multiple pseudo-classes with LCP", () => {
			const decl = postcss.decl({ prop: "cursor", value: "pointer" });
			const result = transformSelectorReduce(
				".a:hover:focus, .b:hover:active",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			// Different first nodes (.a vs .b), so structure groups them
			// They share the same structure (class|pseudo|pseudo)
			expect(scss).toContain(".a, .b");
			expect(scss).toContain("&:hover");
			expect(scss).toContain("cursor: pointer");
		});
	});

	describe("Complex attribute selectors", () => {
		test("should handle attribute with multiple conditions", () => {
			const decl = postcss.decl({ prop: "border", value: "1px solid red" });
			const result = transformSelectorReduce('[data-foo][data-bar="baz"]', {
				declaration: decl,
			});
			const output = result.toString();

			// Chained attributes become nested
			expect(output).toContain("[data-foo]");
			expect(output).toContain('[data-bar="baz"]');
			expect(output).toContain("border: 1px solid red");
		});

		test("should handle attribute with :not() inside", () => {
			const decl = postcss.decl({ prop: "display", value: "none" });
			const result = transformSelectorReduce(":not([data-hidden])", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain(":not([data-hidden])");
		});

		test("should handle attribute with complex value containing colon", () => {
			const decl = postcss.decl({ prop: "content", value: '""' });
			const result = transformSelectorReduce(
				'[data-url^="https://example.com/path"]',
				{ declaration: decl },
			);
			const output = result.toString();

			expect(output).toContain('[data-url^="https://example.com/path"]');
		});
	});

	describe("Deep nesting levels", () => {
		test("should handle 5 levels of nesting", () => {
			const decl = postcss.decl({ prop: "color", value: "blue" });
			const result = transformSelectorReduce(".a .b .c .d .e", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain(".b {");
			expect(scss).toContain(".c {");
			expect(scss).toContain(".d {");
			expect(scss).toContain(".e {");
			expect(scss).toContain("color: blue");
		});

		test("should handle deep nesting with pseudo-class at leaf", () => {
			const decl = postcss.decl({ prop: "opacity", value: "1" });
			const result = transformSelectorReduce(".one .two .three .four:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".one {");
			expect(scss).toContain(".two {");
			expect(scss).toContain(".three {");
			// Pseudo-class becomes nested with &
			expect(scss).toContain(".four {");
			expect(scss).toContain("&:hover");
		});
	});

	describe("Chained classes with pseudo-elements", () => {
		test("should handle .a.b::before", () => {
			const decl = postcss.decl({ prop: "content", value: '"x"' });
			const result = transformSelectorReduce(".a.b::before", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Chained classes become nested
			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b");
			expect(scss).toContain("&::before");
		});

		test("should handle .a.b.c::after", () => {
			const decl = postcss.decl({ prop: "content", value: '"y"' });
			const result = transformSelectorReduce(".a.b.c::after", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Chained classes become nested
			expect(scss).toContain(".a {");
			expect(scss).toContain("&.b");
			expect(scss).toContain("&.c");
			expect(scss).toContain("&::after");
		});

		test("should group chained classes with pseudo-elements", () => {
			const decl = postcss.decl({ prop: "opacity", value: "0.8" });
			const result = transformSelectorReduce(".a.b::before, .c.d::after", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Structure grouping sees same pattern: class|class|pseudo
			// So .a/.c get grouped, .b/.d get grouped, ::before/::after get grouped
			expect(scss).toContain(".a, .c");
			expect(scss).toContain("&.b, &.d");
			expect(scss).toContain("&::before, &::after");
		});
	});

	describe("ID selectors with combinators", () => {
		test("should handle #main > .content", () => {
			const decl = postcss.decl({ prop: "width", value: "100%" });
			const result = transformSelectorReduce("#main > .content", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain("#main > .content");
		});

		test("should handle #main + .sidebar", () => {
			const decl = postcss.decl({ prop: "float", value: "left" });
			const result = transformSelectorReduce("#main + .sidebar", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain("#main + .sidebar");
		});

		test("should handle id with class: #container .item", () => {
			const decl = postcss.decl({ prop: "flex", value: "1" });
			const result = transformSelectorReduce("#container .item", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain("#container {");
			expect(scss).toContain(".item {");
		});
	});

	describe("Mixed selector types", () => {
		test("should handle tag.class", () => {
			const decl = postcss.decl({ prop: "display", value: "inline" });
			const result = transformSelectorReduce("div.highlight", {
				declaration: decl,
			});
			const output = result.toString();

			// Tag + chained class becomes nested
			expect(output).toContain("div {");
			expect(output).toContain("&.highlight");
		});

		test("should handle tag#id", () => {
			const decl = postcss.decl({ prop: "position", value: "absolute" });
			const result = transformSelectorReduce("header#main", {
				declaration: decl,
			});
			const output = result.toString();

			// Tag + chained id becomes nested
			expect(output).toContain("header {");
			expect(output).toContain("&#main");
		});

		test("should handle tag.class:pseudo", () => {
			const decl = postcss.decl({ prop: "cursor", value: "pointer" });
			const result = transformSelectorReduce("a.link:hover", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			// Tag + class + pseudo all become nested
			expect(scss).toContain("a {");
			expect(scss).toContain("&.link");
			expect(scss).toContain("&:hover");
		});
	});

	describe(":not() with combinators", () => {
		test("should handle :not(.parent) .child", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(":not(.parent) .child", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(":not(.parent) {");
			expect(scss).toContain(".child {");
		});

		test("should handle .container > :not(.excluded)", () => {
			const decl = postcss.decl({ prop: "margin", value: "0" });
			const result = transformSelectorReduce(".container > :not(.excluded)", {
				declaration: decl,
			});
			const output = result.toString();

			// Child combinator should prevent nesting
			expect(output).toContain(".container > :not(.excluded)");
		});
	});

	describe("Stress tests - multiple selectors", () => {
		test("should handle 10 different selectors", () => {
			const decl = postcss.decl({ prop: "color", value: "blue" });
			const selector = ".a1, .a2, .a3, .a4, .a5, .a6, .a7, .a8, .a9, .a10";
			const result = transformSelectorReduce(selector, {
				declaration: decl,
			});
			const output = result.toString();

			// Should structure group these
			for (let i = 1; i <= 10; i++) {
				expect(output).toContain(`.a${i}`);
			}
			expect(output).toContain("color: blue");
		});

		test("should handle selectors with varying depths", () => {
			const decl = postcss.decl({ prop: "width", value: "auto" });
			const result = transformSelectorReduce(".a, .b .c, .d .e .f, .g", {
				declaration: decl,
			});
			const output = result.toString();

			// Structure grouping: single classes (.a, .g) group together
			// Nested selectors (.b .c, .d .e .f) handled separately
			expect(output).toContain(".a, .g");
			expect(output).toContain(".b");
			expect(output).toContain(".c");
			expect(output).toContain(".d");
			expect(output).toContain(".e");
			expect(output).toContain(".f");
		});
	});

	describe("Real-world patterns", () => {
		test("should handle BEM-style selectors", () => {
			const decl = postcss.decl({ prop: "display", value: "flex" });
			const result = transformSelectorReduce(
				".block__element, .block--modifier",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			// Both have same structure (class + optional chained class)
			expect(scss).toContain(".block__element, .block--modifier {");
		});

		test("should handle utility class pattern", () => {
			const decl = postcss.decl({ prop: "display", value: "flex" });
			const result = transformSelectorReduce(
				".flex, .items-center, .justify-between",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			// All are single classes, should group
			expect(scss).toContain(".flex, .items-center, .justify-between {");
		});

		test("should handle state selector pattern", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(
				".btn:hover, .btn:focus, .btn:active",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			// LCP is at .btn, pseudo-classes diverge
			expect(scss).toContain(".btn {");
			expect(scss).toContain("&:hover, &:focus, &:active");
		});

		test("should handle nested state pattern", () => {
			const decl = postcss.decl({ prop: "opacity", value: "0.8" });
			const result = transformSelectorReduce(
				".card:hover .title, .card:focus .title",
				{ declaration: decl },
			);
			const scss = toSCSS(result);

			expect(scss).toContain(".card {");
			expect(scss).toContain(".title {");
			expect(scss).toContain("opacity: 0.8");
		});
	});

	describe("Corner cases from ULTRATHINK review", () => {
		test("should handle selector ending with combinator (invalid but should not crash)", () => {
			// This is technically invalid CSS but we should handle it gracefully
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(".a >", {
				declaration: decl,
			});
			// Should produce output even if semantically invalid
			const output = result.toString();
			expect(output).toBeTruthy();
		});

		test("should handle multiple spaces between elements", () => {
			const decl = postcss.decl({ prop: "color", value: "blue" });
			const result = transformSelectorReduce(".a  .b", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".a {");
			expect(scss).toContain(".b {");
		});

		test("should handle tab and newline whitespace", () => {
			const decl = postcss.decl({ prop: "padding", value: "0" });
			const result = transformSelectorReduce(".a\t.b", {
				declaration: decl,
			});
			// Parser normalizes whitespace
			const output = result.toString();
			expect(output).toContain(".a");
			expect(output).toContain(".b");
		});
	});

	describe("Attribute selector edge cases", () => {
		test("should handle attribute with single quotes", () => {
			const decl = postcss.decl({ prop: "content", value: "''" });
			const result = transformSelectorReduce("[type='text']", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain("[type='text']");
		});

		test("should handle attribute with no quotes", () => {
			const decl = postcss.decl({ prop: "display", value: "none" });
			const result = transformSelectorReduce("[disabled]", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain("[disabled]");
		});

		test("should handle attribute with *= (substring match)", () => {
			const decl = postcss.decl({ prop: "color", value: "green" });
			const result = transformSelectorReduce('[class*="icon-"]', {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain('[class*="icon-"]');
		});

		test("should handle attribute with $= (suffix match)", () => {
			const decl = postcss.decl({ prop: "font-weight", value: "bold" });
			const result = transformSelectorReduce('[class$="-btn"]', {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain('[class$="-btn"]');
		});
	});

	describe("Pseudo-class edge cases", () => {
		test("should handle :first-child", () => {
			const decl = postcss.decl({ prop: "margin-top", value: "0" });
			const result = transformSelectorReduce(".item:first-child", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".item {");
			expect(scss).toContain("&:first-child {");
		});

		test("should handle :nth-child(2n)", () => {
			const decl = postcss.decl({ prop: "background", value: "gray" });
			const result = transformSelectorReduce("li:nth-child(2n)", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain("li {");
			expect(scss).toContain("&:nth-child(2n) {");
		});

		test("should handle :has() relationship pseudo-class", () => {
			const decl = postcss.decl({ prop: "display", value: "grid" });
			const result = transformSelectorReduce(".container:has(.sidebar)", {
				declaration: decl,
			});
			const scss = toSCSS(result);

			expect(scss).toContain(".container {");
			expect(scss).toContain("&:has(.sidebar) {");
		});

		test("should handle :is() matches-any pseudo-class", () => {
			const decl = postcss.decl({ prop: "color", value: "red" });
			const result = transformSelectorReduce(":is(.a, .b, .c)", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain(":is(.a, .b, .c)");
		});

		test("should handle :where() pseudo-class", () => {
			const decl = postcss.decl({ prop: "opacity", value: "0.5" });
			const result = transformSelectorReduce(":where(.a, .b)", {
				declaration: decl,
			});
			const output = result.toString();

			expect(output).toContain(":where(.a, .b)");
		});
	});
});

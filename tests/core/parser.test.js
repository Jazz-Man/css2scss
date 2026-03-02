import { describe, expect, test } from "bun:test";
import { parseCSS } from "../../src/core/parser.js";

describe("parseCSS", () => {
	test("should parse simple CSS with class selector", () => {
		const css = ".a { color: red; }";
		const root = parseCSS(css);
		expect(root.type).toBe("root");
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe(".a");
	});

	test("should parse CSS with multiple declarations", () => {
		const css = ".a { color: red; background: blue; }";
		const root = parseCSS(css);
		const rule = root.nodes[0];
		expect(rule.nodes).toHaveLength(2);
		expect(rule.nodes[0].prop).toBe("color");
		expect(rule.nodes[1].prop).toBe("background");
	});

	test("should parse CSS with multiple rules", () => {
		const css = ".a { color: red; } .b { color: blue; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(2);
		expect(root.nodes[0].selector).toBe(".a");
		expect(root.nodes[1].selector).toBe(".b");
	});

	test("should parse CSS with @media queries", () => {
		const css = "@media (max-width: 768px) { .a { color: red; } }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].type).toBe("atrule");
		expect(root.nodes[0].name).toBe("media");
	});

	test("should parse CSS with @keyframes", () => {
		const css = "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].type).toBe("atrule");
		expect(root.nodes[0].name).toBe("keyframes");
	});

	test("should parse CSS with @font-face", () => {
		const css = '@font-face { font-family: "Test"; src: url(test.woff2); }';
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].type).toBe("atrule");
		expect(root.nodes[0].name).toBe("font-face");
	});

	test("should parse CSS with @supports", () => {
		const css = "@supports (display: grid) { .a { display: grid; } }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].type).toBe("atrule");
		expect(root.nodes[0].name).toBe("supports");
	});

	test("should parse CSS with comments", () => {
		const css = "/* comment */ .a { color: red; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(2);
		expect(root.nodes[0].type).toBe("comment");
		expect(root.nodes[1].type).toBe("rule");
	});

	test("should parse complex nested selectors", () => {
		const css = ".a.b .c:hover { color: red; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe(".a.b .c:hover");
	});

	test("should parse CSS with pseudo-elements", () => {
		const css = ".a::before { content: ''; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe(".a::before");
	});

	test("should parse CSS with attribute selectors", () => {
		const css = '[data-test="value"] { color: red; }';
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe('[data-test="value"]');
	});

	test("should parse CSS with combinators", () => {
		const css = ".a > .b + .c ~ .d { color: red; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe(".a > .b + .c ~ .d");
	});

	test("should parse :root selector", () => {
		const css = ":root { --color: red; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe(":root");
	});

	test("should parse universal selector", () => {
		const css = "* { box-sizing: border-box; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe("*");
	});

	test("should throw on invalid CSS", () => {
		expect(() => parseCSS("{invalid")).toThrow();
	});

	test("should throw with descriptive error message", () => {
		try {
			parseCSS("{invalid");
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect(error.message).toContain("CSS parsing error");
		}
	});

	test("should parse CSS with comma-separated selectors", () => {
		const css = ".a, .b, .c { color: red; }";
		const root = parseCSS(css);
		expect(root.nodes).toHaveLength(1);
		expect(root.nodes[0].selector).toBe(".a, .b, .c");
	});

	test("should parse empty CSS", () => {
		const css = "";
		const root = parseCSS(css);
		expect(root.type).toBe("root");
		expect(root.nodes).toHaveLength(0);
	});

	test("should parse CSS with custom properties", () => {
		const css = ".a { --custom-prop: value; }";
		const root = parseCSS(css);
		const rule = root.nodes[0];
		expect(rule.nodes).toHaveLength(1);
		expect(rule.nodes[0].prop).toBe("--custom-prop");
	});

	test("should parse CSS with !important", () => {
		const css = ".a { color: red !important; }";
		const root = parseCSS(css);
		const rule = root.nodes[0];
		expect(rule.nodes[0].important).toBe(true);
	});
});

import { describe, expect, test } from "bun:test";

import postcss from "postcss";
import {
	buildFromNodes,
	buildFromPath,
	buildFromTemplate,
	buildRuleSelector,
	buildSuffixSelectors,
	needsAmpersand,
} from "../../src/poc/selector-builder.js";
import { SelectorTrie } from "../../src/poc/selector-trie.js";

describe("selector-builder", () => {
	describe("needsAmpersand", () => {
		test("should return false for first rule", () => {
			const node = { type: "class", value: ".test" };
			expect(needsAmpersand(node, null, true)).toBe(false);
		});

		test("should return false after space combinator", () => {
			const node = { type: "class", value: ".child" };
			const prevNode = { type: "combinator", value: " " };
			expect(needsAmpersand(node, prevNode, false)).toBe(false);
		});

		test("should return true for pseudo-class", () => {
			const node = { type: "pseudo", value: ":hover" };
			expect(needsAmpersand(node, null, false)).toBe(true);
		});

		test("should return true for class", () => {
			const node = { type: "class", value: ".active" };
			expect(needsAmpersand(node, null, false)).toBe(true);
		});

		test("should return true for id", () => {
			const node = { type: "id", value: "#main" };
			expect(needsAmpersand(node, null, false)).toBe(true);
		});

		test("should return false for tag (no prefix needed)", () => {
			const node = { type: "tag", value: "div" };
			expect(needsAmpersand(node, null, false)).toBe(false);
		});
	});

	describe("buildRuleSelector", () => {
		test("should return value directly for first rule", () => {
			const node = { type: "class", value: ".test" };
			expect(buildRuleSelector(node, null, true)).toBe(".test");
		});

		test("should return value after space combinator", () => {
			const node = { type: "class", value: ".child" };
			const prevNode = { type: "combinator", value: " " };
			expect(buildRuleSelector(node, prevNode, false)).toBe(".child");
		});

		test("should add & for chained pseudo-class", () => {
			const node = { type: "pseudo", value: ":hover" };
			const prevNode = { type: "class", value: ".parent" };
			expect(buildRuleSelector(node, prevNode, false)).toBe("&:hover");
		});

		test("should add & for chained class", () => {
			const node = { type: "class", value: ".active" };
			const prevNode = { type: "class", value: ".parent" };
			expect(buildRuleSelector(node, prevNode, false)).toBe("&.active");
		});
	});

	describe("buildFromNodes", () => {
		test("should build nested rules from nodes", () => {
			const nodes = [
				{ type: "class", value: ".parent" },
				{ type: "combinator", value: " " },
				{ type: "class", value: ".child" },
			];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const _leafRule = buildFromNodes(nodes, root, declarations);

			expect(_leafRule).not.toBeNull();
			const output = root.toString();
			expect(output).toContain(".parent {");
			expect(output).toContain(".child {");
			expect(output).toContain("color: red");
		});

		test("should handle single node", () => {
			const nodes = [{ type: "class", value: ".test" }];
			const declarations = [postcss.decl({ prop: "width", value: "100px" })];
			const root = postcss.root();

			const _leafRule = buildFromNodes(nodes, root, declarations);

			expect(_leafRule).not.toBeNull();
			const output = root.toString();
			expect(output).toContain(".test {");
			expect(output).toContain("width: 100px");
		});

		test("should handle pseudo-class", () => {
			const nodes = [
				{ type: "class", value: ".button" },
				{ type: "pseudo", value: ":hover" },
			];
			const declarations = [postcss.decl({ prop: "cursor", value: "pointer" })];
			const root = postcss.root();

			const _leafRule = buildFromNodes(nodes, root, declarations);

			const output = root.toString();
			expect(output).toContain(".button {");
			expect(output).toContain("&:hover {");
			expect(output).toContain("cursor: pointer");
		});

		test("should return null for empty nodes", () => {
			const nodes = [];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const _leafRule = buildFromNodes(nodes, root, declarations);

			expect(_leafRule).toBeNull();
		});
	});

	describe("buildFromPath", () => {
		test("should build rules from LCP path", () => {
			const path = [
				SelectorTrie.createKey("class", ".parent"),
				SelectorTrie.createKey("combinator", " "),
				SelectorTrie.createKey("class", ".child"),
			];
			const root = postcss.root();

			const _lastRule = buildFromPath(path, SelectorTrie.parseKey, root);

			expect(_lastRule).not.toBeNull();
			const output = root.toString();
			expect(output).toContain(".parent {");
			expect(output).toContain(".child {");
		});

		test("should skip space combinators", () => {
			const path = [
				SelectorTrie.createKey("class", ".parent"),
				SelectorTrie.createKey("combinator", " "),
			];
			const root = postcss.root();

			const _lastRule = buildFromPath(path, SelectorTrie.parseKey, root);

			const output = root.toString();
			expect(output).toContain(".parent {");
			// Only one rule since space combinator is skipped
			expect(output.match(/{/g)).toHaveLength(1);
		});

		test("should return null for empty path", () => {
			const path = [];
			const root = postcss.root();

			const _lastRule = buildFromPath(path, SelectorTrie.parseKey, root);

			expect(_lastRule).toBeNull();
		});
	});

	describe("buildFromTemplate", () => {
		test("should build nested rules from selector group", () => {
			const selectors = [
				{
					selector: ".a:hover",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
				},
				{
					selector: ".b:focus",
					nodes: [
						{ type: "class", value: ".b" },
						{ type: "pseudo", value: ":focus" },
					],
				},
			];
			const declarations = [postcss.decl({ prop: "color", value: "blue" })];
			const root = postcss.root();
			const parentRule = postcss.rule({ selector: ".a, .b" });
			root.append(parentRule);

			const _leafRule = buildFromTemplate(selectors, parentRule, declarations);

			expect(_leafRule).not.toBeNull();
			const output = root.toString();
			expect(output).toContain("&:hover, &:focus");
			expect(output).toContain("color: blue");
		});

		test("should return null for empty selectors", () => {
			const selectors = [];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();
			const parentRule = postcss.rule({ selector: ".test" });
			root.append(parentRule);

			const _leafRule = buildFromTemplate(selectors, parentRule, declarations);

			expect(_leafRule).toBeNull();
		});
	});

	describe("buildSuffixSelectors", () => {
		test("should build suffix selectors with & prefix", () => {
			const selectors = [
				{
					selector: ".a:hover",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
				},
				{
					selector: ".a:focus",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":focus" },
					],
				},
			];
			const lastPathNodeWasSpaceCombinator = false;

			const result = buildSuffixSelectors(
				selectors,
				1,
				lastPathNodeWasSpaceCombinator,
			);

			expect(result).toBe("&:hover, &:focus");
		});

		test("should build suffix selectors without & prefix after space", () => {
			const selectors = [
				{
					selector: ".a .b",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: " " },
						{ type: "class", value: ".b" },
					],
				},
				{
					selector: ".a .c",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: " " },
						{ type: "class", value: ".c" },
					],
				},
			];
			const lastPathNodeWasSpaceCombinator = true;

			const result = buildSuffixSelectors(
				selectors,
				2,
				lastPathNodeWasSpaceCombinator,
			);

			expect(result).toBe(".b, .c");
		});

		test("should handle class suffixes", () => {
			const selectors = [
				{
					selector: ".a.b",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "class", value: ".b" },
					],
				},
				{
					selector: ".a.c",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "class", value: ".c" },
					],
				},
			];
			const lastPathNodeWasSpaceCombinator = false;

			const result = buildSuffixSelectors(
				selectors,
				1,
				lastPathNodeWasSpaceCombinator,
			);

			expect(result).toBe("&.b, &.c");
		});

		test("should handle id suffixes", () => {
			const selectors = [
				{
					selector: ".a#main",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "id", value: "#main" },
					],
				},
				{
					selector: ".a#sub",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "id", value: "#sub" },
					],
				},
			];
			const lastPathNodeWasSpaceCombinator = false;

			const result = buildSuffixSelectors(
				selectors,
				1,
				lastPathNodeWasSpaceCombinator,
			);

			expect(result).toBe("&#main, &#sub");
		});
	});
});

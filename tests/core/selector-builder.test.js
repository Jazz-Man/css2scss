/**
 * Selector builder tests using parameterized testing patterns.
 *
 * Tests the helper utilities for building SCSS rule selectors.
 */

import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import {
	buildFromNodes,
	buildFromPath,
	buildFromTemplate,
	buildRuleSelector,
	buildSuffixSelectors,
	needsAmpersand,
} from "../../src/core/selector-builder.js";
import { SelectorTrie } from "../../src/core/selector-trie.js";

describe("selector-builder", () => {
	describe("needsAmpersand", () => {
		test.each([
			{
				node: { type: "class", value: ".test" },
				prevNode: null,
				isFirst: true,
				expected: false,
				description: "first rule",
			},
			{
				node: { type: "class", value: ".child" },
				prevNode: { type: "combinator", value: " " },
				isFirst: false,
				expected: false,
				description: "after space combinator",
			},
			{
				node: { type: "pseudo", value: ":hover" },
				prevNode: null,
				isFirst: false,
				expected: true,
				description: "pseudo-class",
			},
			{
				node: { type: "class", value: ".active" },
				prevNode: null,
				isFirst: false,
				expected: true,
				description: "chained class",
			},
			{
				node: { type: "id", value: "#main" },
				prevNode: null,
				isFirst: false,
				expected: true,
				description: "chained id",
			},
			{
				node: { type: "tag", value: "div" },
				prevNode: null,
				isFirst: false,
				expected: false,
				description: "tag (no prefix)",
			},
		])("should return $expected for $description", ({
			node,
			prevNode,
			isFirst,
			expected,
		}) => {
			expect(needsAmpersand(node, prevNode, isFirst)).toBe(expected);
		});
	});

	describe("buildRuleSelector", () => {
		test.each([
			{
				node: { type: "class", value: ".test" },
				prevNode: null,
				isFirst: true,
				expected: ".test",
				description: "first rule",
			},
			{
				node: { type: "class", value: ".child" },
				prevNode: { type: "combinator", value: " " },
				isFirst: false,
				expected: ".child",
				description: "after space combinator",
			},
			{
				node: { type: "pseudo", value: ":hover" },
				prevNode: { type: "class", value: ".parent" },
				isFirst: false,
				expected: "&:hover",
				description: "chained pseudo-class",
			},
			{
				node: { type: "class", value: ".active" },
				prevNode: { type: "class", value: ".parent" },
				isFirst: false,
				expected: "&.active",
				description: "chained class",
			},
		])("should return $expected for $description", ({
			node,
			prevNode,
			isFirst,
			expected,
		}) => {
			expect(buildRuleSelector(node, prevNode, isFirst)).toBe(expected);
		});
	});

	describe("buildFromNodes", () => {
		test.each([
			{
				nodes: [
					{ type: "class", value: ".parent" },
					{ type: "combinator", value: " " },
					{ type: "class", value: ".child" },
				],
				declaration: { prop: "color", value: "red" },
				expects: [".parent {", ".child {", "color: red"],
			},
			{
				nodes: [{ type: "class", value: ".test" }],
				declaration: { prop: "width", value: "100px" },
				expects: [".test {", "width: 100px"],
			},
			{
				nodes: [
					{ type: "class", value: ".button" },
					{ type: "pseudo", value: ":hover" },
				],
				declaration: { prop: "cursor", value: "pointer" },
				expects: [".button {", "&:hover {", "cursor: pointer"],
			},
		])("should build nested rules", ({ nodes, declaration, expects }) => {
			const declarations = [postcss.decl(declaration)];
			const root = postcss.root();

			const leafRule = buildFromNodes(nodes, root, declarations);

			expect(leafRule).not.toBeNull();
			const output = root.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});

		test("should return null for empty nodes", () => {
			const nodes = [];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const leafRule = buildFromNodes(nodes, root, declarations);

			expect(leafRule).toBeNull();
		});
	});

	describe("buildFromPath", () => {
		test.each([
			{
				path: [
					SelectorTrie.createKey("class", ".parent"),
					SelectorTrie.createKey("combinator", " "),
					SelectorTrie.createKey("class", ".child"),
				],
				expects: [".parent {", ".child {"],
			},
			{
				path: [
					SelectorTrie.createKey("class", ".test"),
					SelectorTrie.createKey("pseudo", ":hover"),
				],
				expects: [".test {", "&:hover {"],
			},
		])("should build rules from LCP path", ({ path, expects }) => {
			const root = postcss.root();

			const lastRule = buildFromPath(path, SelectorTrie.parseKey, root);

			expect(lastRule).not.toBeNull();
			const output = root.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
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

			const lastRule = buildFromPath(path, SelectorTrie.parseKey, root);

			expect(lastRule).toBeNull();
		});
	});

	describe("buildFromTemplate", () => {
		test.each([
			{
				selectors: [
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
				],
				declaration: { prop: "color", value: "blue" },
				expects: ["&:hover, &:focus", "color: blue"],
			},
		])("should build nested rules from selector group", ({
			selectors,
			declaration,
			expects,
		}) => {
			const declarations = [postcss.decl(declaration)];
			const root = postcss.root();
			const parentRule = postcss.rule({ selector: ".a, .b" });
			root.append(parentRule);

			const leafRule = buildFromTemplate(selectors, parentRule, declarations);

			expect(leafRule).not.toBeNull();
			const output = root.toString();
			for (const expected of expects) {
				expect(output).toContain(expected);
			}
		});

		test("should return null for empty selectors", () => {
			const selectors = [];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();
			const parentRule = postcss.rule({ selector: ".test" });
			root.append(parentRule);

			const leafRule = buildFromTemplate(selectors, parentRule, declarations);

			expect(leafRule).toBeNull();
		});
	});

	describe("buildSuffixSelectors", () => {
		test.each([
			{
				selectors: [
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
				],
				pathLength: 1,
				lastPathNodeWasSpaceCombinator: false,
				expected: "&:hover, &:focus",
			},
			{
				selectors: [
					{
						selector: ".parent .a",
						nodes: [
							{ type: "class", value: ".parent" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".a" },
						],
					},
					{
						selector: ".parent .b",
						nodes: [
							{ type: "class", value: ".parent" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".b" },
						],
					},
				],
				pathLength: 2,
				lastPathNodeWasSpaceCombinator: true,
				expected: ".a, .b",
			},
			{
				selectors: [
					{
						selector: ".test .a:hover",
						nodes: [
							{ type: "class", value: ".test" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":hover" },
						],
					},
					{
						selector: ".test .a:active",
						nodes: [
							{ type: "class", value: ".test" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":active" },
						],
					},
				],
				pathLength: 3,
				lastPathNodeWasSpaceCombinator: false,
				expected: "&:hover, &:active",
			},
		])("should build suffix selectors correctly", ({
			selectors,
			pathLength,
			lastPathNodeWasSpaceCombinator,
			expected,
		}) => {
			const result = buildSuffixSelectors(
				selectors,
				pathLength,
				lastPathNodeWasSpaceCombinator,
			);
			expect(result).toBe(expected);
		});
	});
});

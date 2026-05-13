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
} from "../../src/core/selector-builder.js";
import { SelectorTrie } from "../../src/core/selector-trie.js";

describe("selector-builder", () => {
	describe("buildRuleSelector", () => {
		test.each([
			{
				description: "first rule",
				expected: ".test",
				isFirst: true,
				node: { type: "class", value: ".test" },
				prevNode: null,
			},
			{
				description: "after space combinator",
				expected: ".child",
				isFirst: false,
				node: { type: "class", value: ".child" },
				prevNode: { type: "combinator", value: " " },
			},
			{
				description: "chained pseudo-class",
				expected: "&:hover",
				isFirst: false,
				node: { type: "pseudo", value: ":hover" },
				prevNode: { type: "class", value: ".parent" },
			},
			{
				description: "chained class",
				expected: "&.active",
				isFirst: false,
				node: { type: "class", value: ".active" },
				prevNode: { type: "class", value: ".parent" },
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
				declaration: { prop: "color", value: "red" },
				expects: [".parent {", ".child {", "color: red"],
				nodes: [
					{ type: "class", value: ".parent" },
					{ type: "combinator", value: " " },
					{ type: "class", value: ".child" },
				],
			},
			{
				declaration: { prop: "width", value: "100px" },
				expects: [".test {", "width: 100px"],
				nodes: [{ type: "class", value: ".test" }],
			},
			{
				declaration: { prop: "cursor", value: "pointer" },
				expects: [".button {", "&:hover {", "cursor: pointer"],
				nodes: [
					{ type: "class", value: ".button" },
					{ type: "pseudo", value: ":hover" },
				],
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
				expects: [".parent {", ".child {"],
				path: [
					SelectorTrie.createKey("class", ".parent"),
					SelectorTrie.createKey("combinator", " "),
					SelectorTrie.createKey("class", ".child"),
				],
			},
			{
				expects: [".test {", "&:hover {"],
				path: [
					SelectorTrie.createKey("class", ".test"),
					SelectorTrie.createKey("pseudo", ":hover"),
				],
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
				declaration: { prop: "color", value: "blue" },
				expects: ["&:hover, &:focus", "color: blue"],
				selectors: [
					{
						nodes: [
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":hover" },
						],
						selector: ".a:hover",
					},
					{
						nodes: [
							{ type: "class", value: ".b" },
							{ type: "pseudo", value: ":focus" },
						],
						selector: ".b:focus",
					},
				],
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
				expected: "&:hover, &:focus",
				lastPathNodeWasSpaceCombinator: false,
				pathLength: 1,
				selectors: [
					{
						nodes: [
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":hover" },
						],
						selector: ".a:hover",
					},
					{
						nodes: [
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":focus" },
						],
						selector: ".a:focus",
					},
				],
			},
			{
				expected: ".a, .b",
				lastPathNodeWasSpaceCombinator: true,
				pathLength: 2,
				selectors: [
					{
						nodes: [
							{ type: "class", value: ".parent" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".a" },
						],
						selector: ".parent .a",
					},
					{
						nodes: [
							{ type: "class", value: ".parent" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".b" },
						],
						selector: ".parent .b",
					},
				],
			},
			{
				expected: "&:hover, &:active",
				lastPathNodeWasSpaceCombinator: false,
				pathLength: 3,
				selectors: [
					{
						nodes: [
							{ type: "class", value: ".test" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":hover" },
						],
						selector: ".test .a:hover",
					},
					{
						nodes: [
							{ type: "class", value: ".test" },
							{ type: "combinator", value: " " },
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":active" },
						],
						selector: ".test .a:active",
					},
				],
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

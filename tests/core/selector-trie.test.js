/**
 * SelectorTrie tests using parameterized testing patterns.
 *
 * Tests the trie data structure for CSS selector LCP finding.
 */

import { describe, expect, test } from "bun:test";
import { SelectorTrie, SelectorTrieNode } from "../../src/poc/selector-trie.js";

describe("SelectorTrieNode", () => {
	test("should create a node with correct properties", () => {
		const parent = new SelectorTrieNode(null, "root");
		const key = SelectorTrie.createKey("class", ".test");
		const node = new SelectorTrieNode(key, "class", parent);

		expect(node.key).toBe(key);
		expect(node.nodeType).toBe("class");
		expect(node.parent).toBe(parent);
		expect(node.children).toBeInstanceOf(Map);
		expect(node.selectors).toEqual([]);
		expect(node.depth).toBe(0);
		expect(node.isTerminal).toBe(false);
	});
});

describe("SelectorTrie.parseSelector", () => {
	const parseCases = [
		{
			selector: ".test",
			expectedLength: 1,
			expectedNodes: [{ type: "class", value: ".test" }],
		},
		{
			selector: ".test .c",
			expectedLength: 3,
			expectedNodes: [
				{ type: "class", value: ".test" },
				{ type: "combinator", value: " " },
				{ type: "class", value: ".c" },
			],
		},
		{
			selector: ".test:hover",
			expectedLength: 2,
			expectedNodes: [
				{ type: "class", value: ".test" },
				{ type: "pseudo", value: ":hover" },
			],
		},
		{
			selector: ".test .d:hover",
			expectedLength: 4,
			expectedNodes: [
				{ type: "class", value: ".test" },
				{ type: "combinator", value: " " },
				{ type: "class", value: ".d" },
				{ type: "pseudo", value: ":hover" },
			],
		},
		{
			selector: "#test",
			expectedLength: 1,
			expectedNodes: [{ type: "id", value: "#test" }],
		},
		{
			selector: "div",
			expectedLength: 1,
			expectedNodes: [{ type: "tag", value: "div" }],
		},
		{
			selector: '[type="text"]',
			expectedLength: 1,
			expectedNodes: [{ type: "attribute", value: '[type="text"]' }],
		},
	];

	test.each(parseCases)("should parse $selector", ({
		selector,
		expectedLength,
		expectedNodes,
	}) => {
		const nodes = SelectorTrie.parseSelector(selector);

		expect(nodes).toHaveLength(expectedLength);
		expectedNodes.forEach((expected, index) => {
			expect(nodes[index].type).toBe(expected.type);
			expect(nodes[index].value).toBe(expected.value);
		});
	});
});

describe("SelectorTrie.createKey and parseKey", () => {
	describe("createKey - unique keys", () => {
		test.each([
			{ type1: "class", value1: ".test", type2: "class", value2: ".other" },
			{ type1: "class", value1: ".test", type2: "pseudo", value2: ":hover" },
			{ type1: "pseudo", value1: ":hover", type2: "class", value2: ".test" },
		])("should create unique keys for $type1:$value1 vs $type2:$value2", ({
			type1,
			value1,
			type2,
			value2,
		}) => {
			const key1 = SelectorTrie.createKey(type1, value1);
			const key2 = SelectorTrie.createKey(type2, value2);

			expect(key1).not.toBe(key2);
		});
	});

	describe("parseKey - roundtrip", () => {
		test.each([
			{ type: "class", value: ".test" },
			{ type: "pseudo", value: ":hover" },
			{ type: "attribute", value: '[href^="https://"]' },
		])("should parse $type key back correctly", ({ type, value }) => {
			const key = SelectorTrie.createKey(type, value);
			const parsed = SelectorTrie.parseKey(key);

			expect(parsed).toEqual({ type, value });
		});
	});

	describe("parseKey - edge cases", () => {
		test("should handle values containing colons", () => {
			const key = SelectorTrie.createKey("attribute", '[href^="https://"]');
			const parsed = SelectorTrie.parseKey(key);

			expect(parsed.type).toBe("attribute");
			expect(parsed.value).toBe('[href^="https://"]');
			// The colon in the URL should NOT be treated as a delimiter
			expect(parsed.value).toContain(":");
		});
	});
});

describe("SelectorTrie.insert", () => {
	test.each([
		{ selector: ".test", expectedCount: 1 },
		{ selector: ".test .c", expectedCount: 1 },
		{ selector: ".a.b.c", expectedCount: 1 },
	])("should insert $selector", ({ selector, expectedCount }) => {
		const trie = new SelectorTrie();
		trie.insert(selector);

		expect(trie.selectorCount).toBe(expectedCount);
		expect(trie.root.children.size).toBeGreaterThan(0);
	});

	test("should insert multiple selectors with shared prefix", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test .d:hover");

		expect(trie.selectorCount).toBe(2);

		const classKey = SelectorTrie.createKey("class", ".test");
		const classChild = trie.root.children.get(classKey);
		expect(classChild).toBeDefined();

		// After memory leak fix: selectors are only stored at terminal nodes
		// The ".test" node is intermediate, so it has no selectors
		expect(classChild?.selectors).toHaveLength(0);

		// Terminal nodes (.c and :hover) have the selectors
		const combKey = SelectorTrie.createKey("combinator", " ");
		const combChild = classChild?.children.get(combKey);
		const cKey = SelectorTrie.createKey("class", ".c");
		const dKey = SelectorTrie.createKey("class", ".d");
		const cNode = combChild?.children.get(cKey);
		const dNode = combChild?.children.get(dKey);
		expect(cNode?.selectors).toHaveLength(1);
		expect(dNode?.selectors).toHaveLength(0); // :hover is terminal for .d
		const hoverKey = SelectorTrie.createKey("pseudo", ":hover");
		const hoverNode = dNode?.children.get(hoverKey);
		expect(hoverNode?.selectors).toHaveLength(1);
	});

	test("should mark terminal nodes correctly", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");

		const classKey = SelectorTrie.createKey("class", ".test");
		const classChild = trie.root.children.get(classKey);
		const combKey = SelectorTrie.createKey("combinator", " ");
		const combChild = classChild?.children.get(combKey);
		const cKey = SelectorTrie.createKey("class", ".c");
		const terminalChild = combChild?.children.get(cKey);

		expect(terminalChild?.isTerminal).toBe(true);
		expect(terminalChild?.selectors).toHaveLength(1);
	});
});

describe("SelectorTrie._countSelectors", () => {
	test.each([
		{ selectors: [".test .c", ".test .d:hover"], expectedCount: 2 },
		{ selectors: [".test .c", ".other .x"], atNode: ".test", expectedCount: 1 },
		{ selectors: [".a", ".b", ".c"], expectedCount: 3 },
	])("should count selectors correctly", ({
		selectors,
		expectedCount,
		atNode,
	}) => {
		const trie = new SelectorTrie();
		for (const s of selectors) void trie.insert(s);

		let node = trie.root;
		if (atNode) {
			const key = SelectorTrie.createKey("class", atNode);
			node = trie.root.children.get(key);
		}

		const count = trie._countSelectors(node);
		expect(count).toBe(expectedCount);
	});
});

describe("SelectorTrie.findLCP", () => {
	test.each([
		{
			selectors: [".test .c", ".test .d:hover"],
			description: "common prefix",
			expectedPathLength: 2, // .test + space
		},
		{
			selectors: [".test", ".other"],
			description: "no common prefix",
			isRoot: true,
		},
		{
			selectors: [".a.b", ".a.c"],
			description: "chained classes",
			expectedPathLength: 1, // .a
		},
		{
			selectors: [".a:hover", ".a:focus"],
			description: "pseudo-classes with same base",
			expectedPathLength: 1, // .a
		},
		{
			selectors: [".test .c", ".test .c"],
			description: "identical selectors",
			nonTerminal: true,
		},
	])("should find LCP for $description", ({
		selectors,
		expectedPathLength,
		isRoot,
		nonTerminal,
	}) => {
		const trie = new SelectorTrie();
		for (const s of selectors) void trie.insert(s);

		const lcp = trie.findLCP();

		if (isRoot) {
			expect(lcp).toBe(trie.root);
		} else if (nonTerminal) {
			const path = trie.getPath(lcp);
			expect(path.length).toBeGreaterThan(0);
		} else {
			expect(lcp).toBeDefined();
			const path = trie.getPath(lcp);
			expect(path.length).toBe(expectedPathLength);
		}
	});

	test("should return null for empty trie", () => {
		const trie = new SelectorTrie();
		const lcp = trie.findLCP();
		expect(lcp).toBeNull();
	});
});

describe("SelectorTrie.getPath", () => {
	test.each([
		{
			selector: ".test",
			target: "root",
			expectedPath: [],
		},
		{
			selector: ".test .c",
			target: ".test",
			expectedPath: ["class", ".test"],
		},
		{
			selector: ".test .c",
			target: "terminal",
			expectedPath: ["class", ".test", "combinator", " ", "class", ".c"],
		},
	])("should return path for $target", ({ selector, target, expectedPath }) => {
		const trie = new SelectorTrie();
		trie.insert(selector);

		let node;
		if (target === "root") {
			node = trie.root;
		} else if (target === "terminal") {
			const classKey = SelectorTrie.createKey("class", ".test");
			const combKey = SelectorTrie.createKey("combinator", " ");
			const cKey = SelectorTrie.createKey("class", ".c");
			const classChild = trie.root.children.get(classKey);
			const combChild = classChild?.children.get(combKey);
			node = combChild?.children.get(cKey);
		} else {
			const key = SelectorTrie.createKey("class", target);
			node = trie.root.children.get(key);
		}

		const path = trie.getPath(node);
		const expectedKeys = [];
		for (let i = 0; i < expectedPath.length; i += 2) {
			expectedKeys.push(
				SelectorTrie.createKey(expectedPath[i], expectedPath[i + 1]),
			);
		}
		expect(path).toEqual(expectedKeys);
	});
});

describe("SelectorTrie.getGroups", () => {
	test.each([
		{
			selectors: [".test .c", ".test .d:hover"],
			description: "with common prefix",
			expectedGroups: 1,
		},
		{
			selectors: [".test", ".other"],
			description: "no common prefix",
			expectedGroups: 1,
			hasRootKey: true,
		},
		{
			selectors: [".test"],
			description: "single selector",
			expectedGroups: 1,
		},
	])("should group selectors for $description", ({
		selectors,
		expectedGroups,
		hasRootKey,
	}) => {
		const trie = new SelectorTrie();
		for (const s of selectors) void trie.insert(s);

		const groups = trie.getGroups();

		expect(groups.size).toBe(expectedGroups);
		if (hasRootKey) {
			expect(groups.has("root")).toBe(true);
		}
	});
});

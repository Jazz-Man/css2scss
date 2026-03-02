import { describe, expect, test } from "bun:test";
import { SelectorTrie, SelectorTrieNode } from "../../src/poc/selector-trie.js";

describe("SelectorTrieNode", () => {
	test("should create a node with correct properties", () => {
		const parent = new SelectorTrieNode(null, "root");
		const node = new SelectorTrieNode("class:.test", "class", parent);

		expect(node.key).toBe("class:.test");
		expect(node.nodeType).toBe("class");
		expect(node.parent).toBe(parent);
		expect(node.children).toBeInstanceOf(Map);
		expect(node.selectors).toEqual([]);
		expect(node.depth).toBe(0);
		expect(node.isTerminal).toBe(false);
	});
});

describe("SelectorTrie.parseSelector", () => {
	test("should parse simple class selector", () => {
		const nodes = SelectorTrie.parseSelector(".test");

		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe("class");
		expect(nodes[0].value).toBe(".test");
	});

	test("should parse descendant selector", () => {
		const nodes = SelectorTrie.parseSelector(".test .c");

		expect(nodes).toHaveLength(3);
		expect(nodes[0].type).toBe("class");
		expect(nodes[0].value).toBe(".test");
		expect(nodes[1].type).toBe("combinator");
		expect(nodes[1].value).toBe(" ");
		expect(nodes[2].type).toBe("class");
		expect(nodes[2].value).toBe(".c");
	});

	test("should parse selector with pseudo-class", () => {
		const nodes = SelectorTrie.parseSelector(".test:hover");

		expect(nodes).toHaveLength(2);
		expect(nodes[0].type).toBe("class");
		expect(nodes[0].value).toBe(".test");
		expect(nodes[1].type).toBe("pseudo");
		expect(nodes[1].value).toBe(":hover");
	});

	test("should parse complex descendant with pseudo", () => {
		const nodes = SelectorTrie.parseSelector(".test .d:hover");

		expect(nodes).toHaveLength(4);
		expect(nodes[0].type).toBe("class");
		expect(nodes[0].value).toBe(".test");
		expect(nodes[1].type).toBe("combinator");
		expect(nodes[1].value).toBe(" ");
		expect(nodes[2].type).toBe("class");
		expect(nodes[2].value).toBe(".d");
		expect(nodes[3].type).toBe("pseudo");
		expect(nodes[3].value).toBe(":hover");
	});

	test("should parse id selector", () => {
		const nodes = SelectorTrie.parseSelector("#test");

		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe("id");
		expect(nodes[0].value).toBe("#test");
	});

	test("should parse tag selector", () => {
		const nodes = SelectorTrie.parseSelector("div");

		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe("tag");
		expect(nodes[0].value).toBe("div");
	});

	test("should parse attribute selector", () => {
		const nodes = SelectorTrie.parseSelector('[type="text"]');

		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe("attribute");
		expect(nodes[0].value).toBe('[type="text"]');
	});
});

describe("SelectorTrie.createKey", () => {
	test("should create unique keys for different nodes", () => {
		const key1 = SelectorTrie.createKey("class", ".test");
		const key2 = SelectorTrie.createKey("class", ".other");
		const key3 = SelectorTrie.createKey("pseudo", ":hover");

		expect(key1).toBe("class:.test");
		expect(key2).toBe("class:.other");
		expect(key3).toBe("pseudo::hover");
	});
});

describe("SelectorTrie.insert", () => {
	test("should insert simple class selector", () => {
		const trie = new SelectorTrie();
		trie.insert(".test");

		expect(trie.selectorCount).toBe(1);
		expect(trie.root.children.size).toBe(1);
	});

	test("should insert descendant selector", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");

		expect(trie.selectorCount).toBe(1);

		const classChild = trie.root.children.get("class:.test");
		expect(classChild).toBeDefined();
		expect(classChild?.children.size).toBe(1);

		const combChild = classChild?.children.get("combinator: ");
		expect(combChild).toBeDefined();
	});

	test("should insert multiple selectors", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test .d:hover");

		expect(trie.selectorCount).toBe(2);

		const classChild = trie.root.children.get("class:.test");
		expect(classChild).toBeDefined();

		// Both selectors share the ".test" prefix
		expect(classChild?.selectors).toHaveLength(2);
	});

	test("should mark terminal nodes correctly", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");

		const classChild = trie.root.children.get("class:.test");
		const combChild = classChild?.children.get("combinator: ");
		const terminalChild = combChild?.children.get("class:.c");

		expect(terminalChild?.isTerminal).toBe(true);
		expect(terminalChild?.selectors).toHaveLength(1);
	});
});

describe("SelectorTrie._countSelectors", () => {
	test("should count selectors in subtree", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test .d:hover");

		const count = trie._countSelectors(trie.root);
		expect(count).toBe(2);
	});

	test("should count selectors at specific node", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".other .x");

		const classChild = trie.root.children.get("class:.test");
		const count = trie._countSelectors(classChild);
		expect(count).toBe(1);
	});
});

describe("SelectorTrie.findLCP", () => {
	test("should find LCP for selectors with common prefix", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test .d:hover");

		const lcp = trie.findLCP();
		expect(lcp).toBeDefined();

		// LCP should be at the space combinator (both share .test + space)
		const path = trie.getPath(lcp);
		expect(path).toEqual(["class:.test", "combinator: "]);
	});

	test("should find LCP at root for no common prefix", () => {
		const trie = new SelectorTrie();
		trie.insert(".test");
		trie.insert(".other");

		const lcp = trie.findLCP();
		expect(lcp).toBe(trie.root);
	});

	test("should find LCP for identical selectors", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test .c");

		const lcp = trie.findLCP();
		const path = trie.getPath(lcp);
		// LCP goes all the way to terminal
		expect(path.length).toBeGreaterThan(0);
	});

	test("should return null for empty trie", () => {
		const trie = new SelectorTrie();
		const lcp = trie.findLCP();
		expect(lcp).toBeNull();
	});

	test("should find LCP for chained classes", () => {
		const trie = new SelectorTrie();
		trie.insert(".a.b");
		trie.insert(".a.c");

		const lcp = trie.findLCP();
		const path = trie.getPath(lcp);
		// LCP is at .a
		expect(path).toEqual(["class:.a"]);
	});

	test("should find LCP for pseudo-classes with same base", () => {
		const trie = new SelectorTrie();
		trie.insert(".a:hover");
		trie.insert(".a:focus");

		const lcp = trie.findLCP();
		const path = trie.getPath(lcp);
		// LCP is at .a
		expect(path).toEqual(["class:.a"]);
	});
});

describe("SelectorTrie.getPath", () => {
	test("should return empty path for root", () => {
		const trie = new SelectorTrie();
		const path = trie.getPath(trie.root);
		expect(path).toEqual([]);
	});

	test("should return path for nested node", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");

		const classChild = trie.root.children.get("class:.test");
		const path = trie.getPath(classChild);
		expect(path).toEqual(["class:.test"]);
	});

	test("should return full path to terminal node", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");

		const classChild = trie.root.children.get("class:.test");
		const combChild = classChild?.children.get("combinator: ");
		const terminalChild = combChild?.children.get("class:.c");

		const path = trie.getPath(terminalChild);
		expect(path).toEqual(["class:.test", "combinator: ", "class:.c"]);
	});
});

describe("SelectorTrie.getGroups", () => {
	test("should group selectors by LCP", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test .d:hover");

		const groups = trie.getGroups();

		// Should have one group at the LCP (space combinator)
		expect(groups.size).toBeGreaterThan(0);
	});

	test("should return root group for no common prefix", () => {
		const trie = new SelectorTrie();
		trie.insert(".test");
		trie.insert(".other");

		const groups = trie.getGroups();

		expect(groups.size).toBe(1);
		expect(groups.has("root")).toBe(true);
	});

	test("should handle single selector", () => {
		const trie = new SelectorTrie();
		trie.insert(".test");

		const groups = trie.getGroups();

		// For a single selector, LCP is the terminal node
		expect(groups.size).toBe(1);

		// The group key is the path to the terminal node
		const groupKey = Array.from(groups.keys())[0];
		expect(groupKey).toContain(".test");

		// Get the selector from the group
		const group = groups.get(groupKey);
		expect(group?.selectors).toHaveLength(1);
		expect(group?.selectors[0].selector).toBe(".test");
	});

	test("should group chained classes", () => {
		const trie = new SelectorTrie();
		trie.insert(".a.b");
		trie.insert(".a.c");

		const groups = trie.getGroups();

		// LCP is at .a, both selectors diverge from there
		expect(groups.size).toBeGreaterThan(0);

		// Check that selectors are properly grouped
		for (const [key, group] of groups) {
			if (group.selectors.length > 0) {
				expect(group.selectors[0].selector).toMatch(/^\.a/);
			}
		}
	});

	test("should group pseudo-classes", () => {
		const trie = new SelectorTrie();
		trie.insert(".a:hover");
		trie.insert(".a:focus");

		const groups = trie.getGroups();

		// LCP is at .a
		expect(groups.size).toBeGreaterThan(0);
	});
});

describe("SelectorTrie.getSuffix", () => {
	test("should reconstruct suffix from node sequence", () => {
		const nodes = SelectorTrie.parseSelector(".test .d:hover");

		// Get suffix starting from .d (depth 2, index 2 in nodes)
		const suffix = SelectorTrie.getSuffix(nodes, 2);
		expect(suffix).toBe(".d:hover");
	});

	test("should return full selector when startDepth is 0", () => {
		const nodes = SelectorTrie.parseSelector(".test .c");

		const suffix = SelectorTrie.getSuffix(nodes, 0);
		expect(suffix).toBe(".test .c");
	});

	test("should return empty string when startDepth equals length", () => {
		const nodes = SelectorTrie.parseSelector(".test");

		const suffix = SelectorTrie.getSuffix(nodes, 1);
		expect(suffix).toBe("");
	});
});

describe("SelectorTrie complex scenarios", () => {
	test("should handle three selectors with varying commonality", () => {
		const trie = new SelectorTrie();
		trie.insert(".a:hover");
		trie.insert(".b:hover");
		trie.insert(".c:focus");

		const lcp = trie.findLCP();
		// No common prefix beyond root
		expect(lcp).toBe(trie.root);
	});

	test("should handle descendant vs child combinator", () => {
		const trie = new SelectorTrie();
		trie.insert(".test .c");
		trie.insert(".test > .d");

		const lcp = trie.findLCP();
		const path = trie.getPath(lcp);

		// LCP is at .test (diverges at combinator type)
		expect(path).toEqual(["class:.test"]);
	});

	test("should handle multiple levels of nesting", () => {
		const trie = new SelectorTrie();
		trie.insert(".a .b .c");
		trie.insert(".a .b .d");

		const lcp = trie.findLCP();
		const path = trie.getPath(lcp);

		// LCP is at .b (both share .a .b)
		expect(path).toContain("class:.b");
		expect(path.length).toBeGreaterThanOrEqual(3);
	});
});

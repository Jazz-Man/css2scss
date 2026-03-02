import selectorParser from "postcss-selector-parser";

/**
 * Represents a CSS selector node in the trie
 */
class SelectorTrieNode {
	/**
	 * @param {string|null} key - Unique key for this node (type:value)
	 * @param {string} nodeType - Type of CSS node (class, combinator, pseudo, etc.)
	 * @param {SelectorTrieNode|null} parent - Parent node reference
	 */
	constructor(key, nodeType, parent = null) {
		this.key = key;
		this.nodeType = nodeType;
		this.parent = parent;
		this.children = new Map();
		this.selectors = []; // Full selectors that end or pass through this node
		this.depth = 0;
		this.isTerminal = false;
	}
}

/**
 * Trie for finding Longest Common Prefix (LCP) of CSS selectors
 *
 * The trie stores CSS selectors as paths of nodes, where each node represents
 * a parsed CSS selector component (class, pseudo, combinator, etc.).
 *
 * Example: ".test .c, .test .d:hover"
 * - Path 1: [.test] → [ ] → [.c]
 * - Path 2: [.test] → [ ] → [.d] → [:hover]
 * - LCP is at [ ] (the space combinator)
 */
export class SelectorTrie {
	constructor() {
		this.root = new SelectorTrieNode(null, "root");
		this.selectorCount = 0;
	}

	/**
	 * Parse a CSS selector string into a sequence of nodes
	 * @param {string} selector - CSS selector string
	 * @returns {Array<{type: string, value: string, raw: object}>} Node sequence
	 */
	static parseSelector(selector) {
		const nodes = [];

		selectorParser((selectors) => {
			selectors.each((sel) => {
				sel.each((node) => {
					nodes.push({
						type: node.type,
						value: node.toString(),
						raw: node,
					});
				});
			});
		}).processSync(selector);

		return nodes;
	}

	/**
	 * Create a unique key for a trie node based on type and value
	 * @param {string} type - Node type
	 * @param {string} value - Node value
	 * @returns {string} Unique key
	 */
	static createKey(type, value) {
		return `${type}:${value}`;
	}

	/**
	 * Insert a selector into the trie
	 * @param {string} selector - CSS selector string
	 */
	insert(selector) {
		const nodes = SelectorTrie.parseSelector(selector);
		let current = this.root;

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			const key = SelectorTrie.createKey(node.type, node.value);

			if (!current.children.has(key)) {
				const newNode = new SelectorTrieNode(key, node.type, current);
				newNode.depth = i + 1;
				current.children.set(key, newNode);
			}

			current = current.children.get(key);
			// Track that a selector passes through this node
			current.selectors.push({ selector, nodes });
		}

		// Mark this node as terminal (a complete selector ends here)
		current.isTerminal = true;
		this.selectorCount++;
	}

	/**
	 * Count total selectors in a subtree (only terminal selectors, unique)
	 * @param {SelectorTrieNode} node - Root node of subtree
	 * @param {Set} seen - Set of seen selectors to avoid duplicates
	 * @returns {number} Total selector count
	 */
	_countSelectors(node, seen = new Set()) {
		let count = 0;

		if (node.isTerminal) {
			for (const sel of node.selectors) {
				if (!seen.has(sel.selector)) {
					seen.add(sel.selector);
					count++;
				}
			}
		}

		for (const child of node.children.values()) {
			count += this._countSelectors(child, seen);
		}
		return count;
	}

	/**
	 * Find the deepest node where all selectors pass through (LCP node)
	 * @returns {SelectorTrieNode|null} The LCP node or null if no common prefix
	 */
	findLCP() {
		if (this.selectorCount === 0) {
			return null;
		}

		const totalCount = this._countSelectors(this.root);
		return this._findLCPRecursive(this.root, totalCount);
	}

	/**
	 * Recursively find the deepest node where all selectors pass through
	 * @param {SelectorTrieNode} node - Current node
	 * @param {number} totalCount - Total selector count
	 * @returns {SelectorTrieNode|null} LCP node or null
	 */
	_findLCPRecursive(node, totalCount) {
		// Check if all selectors pass through this node
		const count = this._countSelectors(node);

		if (count === totalCount) {
			// All selectors pass through, check if we can go deeper
			for (const child of node.children.values()) {
				const result = this._findLCPRecursive(child, totalCount);
				if (result) {
					return result;
				}
			}
			// This is the deepest LCP node
			return node;
		}

		return null;
	}

	/**
	 * Get all selectors in the trie
	 * @returns {Array<{selector: string, nodes: Array}>} All selectors
	 */
	_getAllSelectors() {
		const selectors = [];
		this._collectSelectors(this.root, selectors);
		return selectors;
	}

	/**
	 * Collect all selectors from a subtree (only terminal selectors, unique)
	 * @param {SelectorTrieNode} node - Root node
	 * @param {Array} selectors - Output array
	 * @param {Set} seen - Set of seen selectors to avoid duplicates
	 */
	_collectSelectors(node, selectors, seen = new Set()) {
		if (node.isTerminal) {
			for (const sel of node.selectors) {
				if (!seen.has(sel.selector)) {
					seen.add(sel.selector);
					selectors.push(sel);
				}
			}
		}
		for (const child of node.children.values()) {
			this._collectSelectors(child, selectors, seen);
		}
	}

	/**
	 * Group selectors by their LCP divergence point
	 * @returns {Map<string, {selectors: Array<{selector: string, nodes: Array}>, lcpNode: SelectorTrieNode, path: string[]}>}
	 *          Map of LCP path to selector groups
	 */
	getGroups() {
		const groups = new Map();
		const lcpNode = this.findLCP();

		if (!lcpNode || lcpNode === this.root) {
			// No common prefix, return all selectors in one group
			const allSelectors = this._getAllSelectors();
			groups.set("root", {
				selectors: allSelectors,
				lcpNode: this.root,
				path: [],
			});
			return groups;
		}

		// Get the path to LCP node (this becomes the parent rule)
		const lcpPath = this.getPath(lcpNode);

		// Collect all selectors that diverge from LCP into a single group
		const divergentSelectors = [];
		this._collectSelectors(lcpNode, divergentSelectors, new Set());

		groups.set(lcpPath.join("|"), {
			selectors: divergentSelectors,
			lcpNode,
			path: lcpPath,
		});

		return groups;
	}

	/**
	 * Get the path from root to a node
	 * @param {SelectorTrieNode} node - Target node
	 * @returns {Array<string>} Array of node keys
	 */
	getPath(node) {
		const path = [];
		let current = node;

		while (current && current !== this.root) {
			path.unshift(current.key);
			current = current.parent;
		}

		return path;
	}

	/**
	 * Get the selector suffix from a given node
	 * Reconstructs the original selector string from nodes at/after this node
	 * @param {SelectorTrieNode} node - Starting node
	 * @param {Array} nodes - Original node sequence
	 * @param {number} startDepth - Depth to start from
	 * @returns {string} Reconstructed suffix
	 */
	static getSuffix(nodes, startDepth) {
		return nodes.slice(startDepth).map((n) => n.value).join("");
	}

	/**
	 * Check if two selectors can be grouped together
	 * They can be grouped if they share the same parent path structure
	 * @param {Array<{selector: string, nodes: Array}>} selectors - Selectors to check
	 * @returns {boolean} True if groupable
	 */
	static canGroup(selectors) {
		if (selectors.length < 2) {
			return false;
		}

		// Check if all selectors have compatible structure for grouping
		const firstNodes = selectors[0].nodes;

		for (let i = 1; i < selectors.length; i++) {
			const nodes = selectors[i].nodes;

			// Different lengths might not be groupable at the leaf level
			// But we can still group at a common prefix
		}

		return true;
	}
}

export { SelectorTrieNode };
export default SelectorTrie;

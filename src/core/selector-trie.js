/**
 * @module selector-trie
 *
 * Trie data structure for finding Longest Common Prefix (LCP) of CSS selectors.
 *
 * This module provides a trie-based approach to selector grouping that enables
 * efficient CSS-to-SCSS transformation with automatic nesting.
 *
 * ## Key Features:
 * - Fast LCP finding using trie traversal
 * - Memory-efficient storage (selectors only at terminal nodes)
 * - Support for all CSS selector types (class, id, pseudo, combinators, etc.)
 *
 * ## Usage:
 * ```javascript
 * import { SelectorTrie } from './selector-trie.js';
 *
 * const trie = new SelectorTrie();
 * trie.insert('.test .c');
 * trie.insert('.test .d:hover');
 *
 * const lcp = trie.findLCP();
 * const groups = trie.getGroups();
 * ```
 *
 * @see {@link reduce-transformer.js} for usage in CSS-to-SCSS transformation
 */

import selectorParser from "postcss-selector-parser";

/**
 * ASCII Unit Separator (0x1F) - safe delimiter for CSS selector values
 * This character is guaranteed not to appear in valid CSS selectors
 */
export const KEY_DELIMITER = "\x1F";

/**
 * CSS Combinator values
 */
export const COMBINATORS = {
	SPACE: " ",
	CHILD: ">",
	ADJACENT_SIBLING: "+",
	GENERAL_SIBLING: "~",
};

/**
 * CSS Selector prefixes
 */
export const PREFIXES = {
	CLASS: ".",
	ID: "#",
	PSEUDO: ":",
	UNIVERSAL: "*",
};
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
		this.selectors = []; // Full selectors that END at this terminal node only
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
	 * Uses ASCII Unit Separator (0x1F) as delimiter to avoid conflicts
	 * @param {string} type - Node type
	 * @param {string} value - Node value
	 * @returns {string} Unique key
	 */
	static createKey(type, value) {
		return `${type}${KEY_DELIMITER}${value}`;
	}

	/**
	 * Parse a trie key back into type and value
	 * @param {string} key - Trie node key
	 * @returns {{type: string, value: string}} Parsed type and value
	 */
	static parseKey(key) {
		const delimiterIndex = key.indexOf(KEY_DELIMITER);
		if (delimiterIndex === -1) {
			// Fallback for old-style keys with ":" delimiter
			const colonIndex = key.indexOf(":");
			if (colonIndex !== -1) {
				return {
					type: key.slice(0, colonIndex),
					value: key.slice(colonIndex + 1),
				};
			}
			throw new Error(`Invalid trie key format: ${key}`);
		}
		return {
			type: key.slice(0, delimiterIndex),
			value: key.slice(delimiterIndex + 1),
		};
	}

	/**
	 * Insert a selector into the trie
	 * @param {string} selector - CSS selector string
	 * @param {Array<{type: string, value: string, raw: object}>|undefined} preParsedNodes - Optionally pre-parsed nodes to avoid re-parsing
	 */
	insert(selector, preParsedNodes = undefined) {
		const nodes = preParsedNodes ?? SelectorTrie.parseSelector(selector);
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
		}

		// Store selector ONLY at terminal node to reduce memory overhead
		current.selectors.push({ selector, nodes });
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
	 * Count selectors that continue beyond this node (have descendants)
	 * For LCP finding, we need all selectors to have the SAME path
	 * @param {SelectorTrieNode} node - Root node of subtree
	 * @returns {number} Count of selectors continuing beyond this node
	 */
	_countContinuingSelectors(node) {
		// A selector "continues" if it has children in this subtree
		// We count unique selectors that appear in any child (not at this node)
		const seen = new Set();
		let count = 0;

		for (const child of node.children.values()) {
			const childCount = this._countSelectors(child, seen);
			count += childCount;
		}

		return count;
	}

	/**
	 * Find the deepest node where all selectors pass through (LCP node)
	 * For LCP, all selectors must continue beyond the node (same path)
	 * @returns {SelectorTrieNode|null} The LCP node or null if no common prefix
	 */
	findLCP() {
		if (this.selectorCount === 0) {
			return null;
		}

		// Count unique selectors (handles duplicate insertions)
		const uniqueCount = this._countUniqueSelectors(this.root);

		// If only one unique selector, LCP is the full path
		if (uniqueCount === 1) {
			return this._findSingleSelectorLCP(this.root);
		}

		return this._findLCPRecursive(this.root, uniqueCount);
	}

	/**
	 * Count unique selectors in a subtree
	 * @param {SelectorTrieNode} node - Root node of subtree
	 * @returns {number} Count of unique selectors
	 */
	_countUniqueSelectors(node) {
		const seen = new Set();
		return this._countSelectors(node, seen);
	}

	/**
	 * Find LCP for a single selector (should be the full path)
	 * @param {SelectorTrieNode} node - Starting node
	 * @returns {SelectorTrieNode} Terminal node of the single selector
	 */
	_findSingleSelectorLCP(node) {
		// Follow the single path to the terminal node
		for (const child of node.children.values()) {
			return this._findSingleSelectorLCP(child);
		}
		return node;
	}

	/**
	 * Recursively find the deepest node where all selectors pass through
	 * @param {SelectorTrieNode} node - Current node
	 * @param {number} totalCount - Total unique selector count
	 * @returns {SelectorTrieNode|null} LCP node or null
	 */
	_findLCPRecursive(node, totalCount) {
		// Check if all selectors continue beyond this node
		const continuingCount = this._countContinuingSelectors(node);

		if (continuingCount === totalCount) {
			// Check if any selector ends at this node
			// If so, this node cannot be LCP because those selectors don't continue
			if (node.isTerminal && node.selectors.length > 0) {
				// At least one selector ends here - not a common prefix
				return null;
			}

			// All selectors continue, check if we can go deeper
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
		return nodes
			.slice(startDepth)
			.map((n) => n.value)
			.join("");
	}
}

export { SelectorTrieNode };
export default SelectorTrie;

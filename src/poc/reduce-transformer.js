import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import {
	buildFromNodes,
	buildFromPath,
	buildSuffixSelectors,
} from "./selector-builder.js";
import { SelectorTrie } from "./selector-trie.js";
import { buildStructureGroup, groupByStructure } from "./structure-grouper.js";

/**
 * Check if the LCP path contains any non-space combinators (>, +, ~)
 * These cannot be properly expressed in nested SCSS rules
 * @param {string[]} path - LCP path array of trie keys
 * @returns {boolean} True if path contains non-space combinators
 */
function hasNonSpaceCombinators(path) {
	return path.some((key) => {
		const { type, value } = SelectorTrie.parseKey(key);
		return type === "combinator" && value !== " ";
	});
}

/**
 * Build flat output for selectors that cannot be nested
 * (when LCP contains non-space combinators like >, +, ~)
 * @param {{selector: string}[]} selectors - Selectors to output
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildFlatSelectors(selectors, declarations, root) {
	const flatSelector = selectors.map((s) => s.selector).join(", ");
	const flatRule = postcss.rule({ selector: flatSelector });
	root.append(flatRule);

	for (const decl of declarations) {
		flatRule.append(decl.clone());
	}
}

/**
 * Build nested rules for a single selector using the trie-based approach
 * @param {string} selector - CSS selector string
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildSingleSelector(selector, declarations, root) {
	// First, check if the selector contains non-space combinators
	// If so, output as a flat rule since these can't be properly nested
	let hasNonSpaceCombinator = false;
	const nodes = [];

	selectorParser((selectors) => {
		selectors.each((sel) => {
			sel.each((node) => {
				nodes.push({
					type: node.type,
					value: node.toString(),
				});
				if (node.type === "combinator" && node.value !== " ") {
					hasNonSpaceCombinator = true;
				}
			});
		});
	}).processSync(selector);

	if (hasNonSpaceCombinator) {
		// Output as flat rule
		const rule = postcss.rule({ selector });
		root.append(rule);
		for (const decl of declarations) {
			rule.append(decl.clone());
		}
		return;
	}

	// Use buildFromNodes helper for space-combinator-only selectors
	buildFromNodes(nodes, root, declarations);
}

/**
 * Build nested rules for a group of selectors with common LCP
 * @param {{selectors: Array<{selector: string, nodes: Array}>, lcpNode: import('./selector-trie.js').SelectorTrieNode, path: string[]}} group
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildLCPGroup(group, declarations, root) {
	const { selectors, path } = group;

	if (selectors.length === 1) {
		// Single selector - use simple path
		buildSingleSelector(selectors[0].selector, declarations, root);
		return;
	}

	// Phase 1: Check if LCP path contains non-space combinators
	// These cannot be properly expressed in nested SCSS rules
	if (path.length > 0 && hasNonSpaceCombinators(path)) {
		// Output as flat selectors instead of nesting
		buildFlatSelectors(selectors, declarations, root);
		return;
	}

	// When path is empty, there's no common prefix
	// Use structure-based grouping for selectors with similar patterns
	if (path.length === 0) {
		const structureGroups = groupByStructure(selectors);

		// For each structure group, build the nested output
		for (const group of structureGroups.values()) {
			if (group.length === 1) {
				// Single selector, use simple path
				buildSingleSelector(group[0].selector, declarations, root);
			} else {
				// Try to build structure group
				// Returns false if grouping failed (e.g., non-space combinators)
				const grouped = buildStructureGroup(group, declarations, root);

				if (!grouped) {
					// Grouping failed, output as flat selectors
					buildFlatSelectors(group, declarations, root);
				}
			}
		}
		return;
	}

	// Multiple selectors with common prefix
	// Build the parent rule path from LCP using helper function
	const currentRule = buildFromPath(path, SelectorTrie.parseKey, root);

	// Now add the divergent selectors at the leaf level
	// Check if last node in path was a space combinator to determine & prefix
	const lastPathNodeWasSpaceCombinator =
		path.length > 0 &&
		SelectorTrie.parseKey(path[path.length - 1]).type === "combinator" &&
		SelectorTrie.parseKey(path[path.length - 1]).value === " ";

	const leafSelector = buildSuffixSelectors(
		selectors,
		path.length,
		lastPathNodeWasSpaceCombinator,
	);

	if (currentRule) {
		const leafRule = postcss.rule({ selector: leafSelector });
		currentRule.append(leafRule);

		// Add declarations
		for (const decl of declarations) {
			leafRule.append(decl.clone());
		}
	}
}

/**
 * Transforms a CSS selector string into nested SCSS rules using LCP trie approach
 * @param {string} selectorString - CSS selector (e.g., ".a.b, .c:hover")
 * @param {object} options - Options
 * @param {import('postcss').Declaration|import('postcss').Declaration[]} options.declarations - Declaration(s) to add to leaf rules (single or array)
 * @returns {import('postcss').Root} PostCSS Root with nested rules
 */
export function transformSelectorReduce(selectorString, options = {}) {
	const newRoot = postcss.root();

	// Support both `declaration` (singular) and `declarations` (array) for backward compatibility
	let declarations = options.declarations || options.declaration;
	if (!declarations) {
		throw new Error(
			"transformSelectorReduce requires 'declarations' or 'declaration' option",
		);
	} else if (!Array.isArray(declarations)) {
		declarations = [declarations];
	}

	// Build trie from comma-separated selectors
	const trie = new SelectorTrie();

	selectorParser((selectors) => {
		selectors.each((sel) => {
			const selector = sel.toString().trim();
			const nodes = SelectorTrie.parseSelector(selector);
			trie.insert(selector, nodes);
			return true;
		});
	}).processSync(selectorString);

	// Get groups by LCP
	const groups = trie.getGroups();

	// Generate nested output for each group
	for (const group of groups.values()) {
		buildLCPGroup(group, declarations, newRoot);
	}

	return newRoot;
}

/**
 * Transforms a PostCSS Rule into nested SCSS rules
 * @param {import('postcss').Rule} rule - PostCSS Rule with selector and declarations
 * @returns {import('postcss').Root} PostCSS Root with nested rules
 */
export function transformRule(rule) {
	return transformSelectorReduce(rule.selector, {
		declarations: [...rule.nodes],
	});
}

/**
 * Transforms a CSS string into nested SCSS
 * @param {string} css - CSS string to transform
 * @returns {string} SCSS string
 */
export function transformCSS(css) {
	const root = postcss.parse(css);
	const output = postcss.root();

	root.walkRules((rule) => {
		const transformed = transformRule(rule);
		output.append(transformed.nodes);
	});

	return output.toString();
}

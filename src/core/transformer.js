/**
 * @module transformer
 *
 * CSS to SCSS transformation using LCP-based selector grouping.
 *
 * This module transforms flat CSS selectors into nested SCSS rules using
 * a trie-based Longest Common Prefix (LCP) algorithm. The transformation
 * groups selectors by their common prefixes and generates optimized nested output.
 *
 * ## Transformation Strategy:
 * 1. **LCP Grouping**: Find the longest common prefix among selectors
 * 2. **Structure Grouping**: When no LCP exists, group by structural patterns
 * 3. **Flat Output**: For non-space combinators (>, +, ~), output as flat selectors
 *
 * ## Example:
 * ```javascript
 * // Input: ".test .c, .test .d:hover { color: red; }"
 * // Output:
 * // .test {
 * //   .c, .d {
 * //     &:hover { color: red; }
 * //   }
 * // }
 * ```
 *
 * @see {@link selector-trie.js}
 * @see {@link structure-grouper.js}
 * @see {@link selector-builder.js}
 */

import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import {
	buildFromNodes,
	buildFromPath,
	buildSuffixSelectors,
} from "./selector-builder.js";
import { COMBINATORS, SelectorTrie } from "./selector-trie.js";
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
		return type === "combinator" && value !== COMBINATORS.SPACE;
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
				if (node.type === "combinator" && node.value !== COMBINATORS.SPACE) {
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
 * @typedef {object} GroupingStrategy
 * @property {(group: object) => boolean} canHandle - Check if strategy applies
 * @property {(group: object, declarations: import('postcss').Declaration[], root: import('postcss').Root) => void} build - Build output
 */

// ============================================================================
// Strategy 1: Single Selector
// ============================================================================

/**
 * Check if single selector strategy applies
 * @param {{selectors: Array, path: string[]}} group - Selector group
 * @returns {boolean} True if only one selector OR LCP path covers entire selector
 */
function canHandleSingle(group) {
	// Check if there's only one selector in the group
	if (group.selectors.length === 1) {
		return true;
	}

	// Check if LCP path covers the entire first selector
	// This happens when all selectors are identical
	const firstSelector = group.selectors[0];
	return group.path.length === firstSelector.nodes.length;
}

/**
 * Build output for a single selector
 * @param {{selectors: Array}} group - Selector group
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildSingle(group, declarations, root) {
	buildSingleSelector(group.selectors[0].selector, declarations, root);
}

// ============================================================================
// Strategy 2: Non-Space Combinators (Flat Output)
// ============================================================================

/**
 * Check if flat output strategy applies (non-space combinators in path)
 * @param {{path: string[]}} group - Selector group with LCP path
 * @returns {boolean} True if path contains non-space combinators
 */
function canHandleFlat(group) {
	return group.path.length > 0 && hasNonSpaceCombinators(group.path);
}

/**
 * Build flat output for selectors with non-space combinators
 * @param {{selectors: Array}} group - Selector group
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildFlat(group, declarations, root) {
	buildFlatSelectors(group.selectors, declarations, root);
}

// ============================================================================
// Strategy 3: Structure Grouping (No LCP)
// ============================================================================

/**
 * Check if structure grouping applies (empty LCP path)
 * @param {{path: string[]}} group - Selector group
 * @returns {boolean} True if path is empty
 */
function canHandleStructure(group) {
	return group.path.length === 0;
}

/**
 * Build output using structure-based grouping
 * @param {{selectors: Array}} group - Selector group
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildStructure(group, declarations, root) {
	const structureGroups = groupByStructure(group.selectors);

	for (const subgroup of structureGroups.values()) {
		if (subgroup.length === 1) {
			buildSingleSelector(subgroup[0].selector, declarations, root);
		} else {
			const grouped = buildStructureGroup(subgroup, declarations, root);
			if (!grouped) {
				buildFlatSelectors(subgroup, declarations, root);
			}
		}
	}
}

// ============================================================================
// Strategy 4: LCP Grouping (Default)
// ============================================================================

/**
 * LCP strategy always applies as fallback
 * @returns {boolean} Always true
 */
function canHandleLCP() {
	return true;
}

/**
 * Build nested output using LCP path
 * @param {{selectors: Array, path: string[]}} group - Selector group with LCP
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildLCP(group, declarations, root) {
	const { selectors, path } = group;

	const currentRule = buildFromPath(path, SelectorTrie.parseKey, root);

	const lastPathNodeWasSpaceCombinator =
		path.length > 0 &&
		SelectorTrie.parseKey(path[path.length - 1]).type === "combinator" &&
		SelectorTrie.parseKey(path[path.length - 1]).value === COMBINATORS.SPACE;

	const leafSelector = buildSuffixSelectors(
		selectors,
		path.length,
		lastPathNodeWasSpaceCombinator,
	);

	if (currentRule) {
		const leafRule = postcss.rule({ selector: leafSelector });
		currentRule.append(leafRule);

		for (const decl of declarations) {
			leafRule.append(decl.clone());
		}
	}
}

// ============================================================================
// Strategy Dispatcher
// ============================================================================

/**
 * Grouping strategies in priority order
 * @type {GroupingStrategy[]}
 */
const strategies = [
	{ canHandle: canHandleSingle, build: buildSingle },
	{ canHandle: canHandleFlat, build: buildFlat },
	{ canHandle: canHandleStructure, build: buildStructure },
	{ canHandle: canHandleLCP, build: buildLCP },
];

/**
 * Build nested rules for a group of selectors with common LCP
 * Dispatches to appropriate strategy based on group characteristics
 * @param {{selectors: Array<{selector: string, nodes: Array}>, lcpNode: import('./selector-trie.js').SelectorTrieNode, path: string[]}} group
 * @param {import('postcss').Declaration[]} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 */
function buildLCPGroup(group, declarations, root) {
	for (const strategy of strategies) {
		if (strategy.canHandle(group)) {
			strategy.build(group, declarations, root);
			return;
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

	// Validate selector string
	if (!selectorString || selectorString.trim().length === 0) {
		throw new Error(
			"transformSelectorReduce requires a non-empty selector string",
		);
	}

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
 * Find or create an @media rule with the given params inside a parent rule
 * @param {import('postcss').Rule} parentRule - The rule to nest @media inside
 * @param {string} params - @media query params (e.g., "max-width: 768px")
 * @returns {import('postcss').AtRule} The @media rule
 */
function findOrCreateMediaRule(parentRule, params) {
	// Find existing @media with same params
	for (const node of parentRule.nodes || []) {
		if (
			node.type === "atrule" &&
			node.name === "media" &&
			node.params === params
		) {
			return node;
		}
	}
	// Create new @media rule
	const mediaRule = postcss.atRule({ name: "media", params });
	parentRule.append(mediaRule);
	return mediaRule;
}

/**
 * Sort rule nodes to ensure order: declarations → @media → child rules
 * Also recursively sorts nested rules
 * @param {import('postcss').Rule} rule - The rule to sort
 */
function sortRuleNodes(rule) {
	const decls = [];
	const atrules = [];
	const childRules = [];

	for (const node of rule.nodes || []) {
		if (node.type === "decl") {
			node.raws.semicolon = true;
			decls.push(node);
		} else if (node.type === "atrule" && node.name === "media") {
			atrules.push(node);
		} else if (node.type === "rule") {
			childRules.push(node);
			sortRuleNodes(node); // Recurse
		} else {
			decls.push(node); // Comments, etc. stay with declarations
		}
	}

	rule.removeAll();
	for (const node of [...decls, ...atrules, ...childRules]) {
		rule.append(node);
	}
}

/**
 * Recursively find or create a rule with the given selector inside a parent
 * @param {import('postcss').Container} parent - Parent container (Root or Rule)
 * @param {string} selector - Selector to find or create
 * @returns {import('postcss').Rule} The found or created rule
 */
function findOrCreateRule(parent, selector) {
	// Find existing rule with same selector
	for (const node of parent.nodes || []) {
		if (node.type === "rule" && node.selector === selector) {
			return node;
		}
	}
	// Create new rule
	const rule = postcss.rule({ selector });
	parent.append(rule);
	return rule;
}

/**
 * Recursively merge transformed nodes into a parent container
 * This ensures rules with the same selector path are merged together
 * @param {import('postcss').Container} parent - Parent to merge into
 * @param {import('postcss').Node[]} nodes - Nodes to merge
 * @param {string|null} mediaParams - If set, wrap declarations in @media
 */
function mergeNodes(parent, nodes, mediaParams = null) {
	for (const node of nodes) {
		if (node.type === "decl") {
			// Declaration - append directly (or inside @media if specified)
			if (mediaParams) {
				const mediaRule = findOrCreateMediaRule(parent, mediaParams);
				mediaRule.append(node.clone());
			} else {
				parent.append(node.clone());
			}
		} else if (node.type === "rule") {
			// Rule - find or create, then recursively merge children
			const targetRule = findOrCreateRule(parent, node.selector);
			mergeNodes(targetRule, node.nodes || [], mediaParams);
		} else if (node.type === "atrule" && node.name === "media") {
			// @media rule - merge children with media context
			mergeNodes(parent, node.nodes || [], node.params);
		} else {
			// Other nodes (comments, etc.) - just append
			parent.append(node.clone());
		}
	}
}

/**
 * Transforms a CSS string into nested SCSS
 * @param {string} css - CSS string to transform
 * @returns {string} SCSS string
 */
export function transformCSS(css) {
	const root = postcss.parse(css);
	const output = postcss.root();

	// Pass 1: Process non-media rules with merging
	root.walkRules((rule) => {
		// Skip rules inside @media or other at-rules
		if (rule.parent.type === "atrule") {
			return;
		}

		const transformed = transformRule(rule);
		mergeNodes(output, transformed.nodes);
	});

	// Pass 2: Process @media rules - merge with existing structure
	root.walkAtRules(/media/, (atRule) => {
		atRule.walkRules((rule) => {
			const transformed = transformRule(rule);
			// Merge with media context - will find existing rules and nest @media inside
			mergeNodes(output, transformed.nodes, atRule.params);
		});
	});

	// Sort all rules to ensure declarations → @media → child rules order
	for (const node of output.nodes) {
		if (node.type === "rule") {
			sortRuleNodes(node);
		}
	}

	return output.toString();
}

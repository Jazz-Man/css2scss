/**
 * @module selector-builder
 *
 * Helper utilities for building SCSS rule selectors from parsed CSS nodes.
 *
 * This module extracts common selector-building logic used across
 * reduce-transformer.js and structure-grouper.js to reduce duplication
 * and improve testability.
 *
 * ## Key Features:
 * - Consistent ampersand (&) prefix handling
 * - Nested rule generation from parsed nodes
 * - Support for all CSS combinator types
 *
 * @see {@link reduce-transformer.js}
 * @see {@link structure-grouper.js}
 */

import postcss from "postcss";
import { COMBINATORS } from "./selector-trie.js";

/**
 * Determine if a selector needs an ampersand prefix
 * @param {{type: string, value: string}} node - Current node
 * @param {{type: string, value: string}|null} prevNode - Previous node in sequence
 * @param {boolean} isFirst - Is this the first rule?
 * @returns {boolean} True if ampersand prefix is needed
 */
export function needsAmpersand(node, prevNode, isFirst) {
	if (isFirst) {
		return false;
	}

	// After space combinator, no ampersand needed (descendant selector)
	const prevWasSpaceCombinator =
		prevNode?.type === "combinator" && prevNode?.value === COMBINATORS.SPACE;
	if (prevWasSpaceCombinator) {
		return false;
	}

	// Chained pseudo-class, id, or class need ampersand
	return (
		node.type === "pseudo" ||
		node.value.startsWith(":") ||
		node.value.startsWith(".") ||
		node.value.startsWith("#")
	);
}

/**
 * Build a rule selector string from a parsed node
 * @param {{type: string, value: string}} node - Current node
 * @param {{type: string, value: string}|null} prevNode - Previous node in sequence
 * @param {boolean} isFirst - Is this the first rule?
 * @returns {string} Rule selector string
 */
export function buildRuleSelector(node, prevNode, isFirst) {
	if (isFirst) {
		return node.value;
	}

	// After space combinator, use value directly (descendant)
	const prevWasSpaceCombinator =
		prevNode?.type === "combinator" && prevNode?.value === COMBINATORS.SPACE;
	if (prevWasSpaceCombinator) {
		return node.value;
	}

	// Chained selector
	return `&${node.value}`;
}

/**
 * Build nested SCSS rules from a sequence of nodes
 * @param {{type: string, value: string}[]} nodes - Nodes to build rules from
 * @param {import('postcss').Root} root - PostCSS root to append to
 * @param {import('postcss').Declaration[]} declarations - Declarations to add to leaf
 * @returns {import('postcss').Rule|null} The leaf rule where declarations were added
 */
export function buildFromNodes(nodes, root, declarations) {
	if (nodes.length === 0) {
		return null;
	}

	let currentRule = null;

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];

		// Skip space combinators - they're implicit in nesting
		if (node.type === "combinator" && node.value === COMBINATORS.SPACE) {
			continue;
		}

		const prevNode = i > 0 ? nodes[i - 1] : null;
		const isFirst = currentRule === null;
		const ruleSelector = buildRuleSelector(node, prevNode, isFirst);

		const newRule = postcss.rule({ selector: ruleSelector });

		if (isFirst) {
			root.append(newRule);
		} else if (currentRule) {
			currentRule.append(newRule);
		}

		currentRule = newRule;
	}

	// Add declarations to leaf rule
	if (currentRule) {
		for (const decl of declarations) {
			currentRule.append(decl.clone());
		}
	}

	return currentRule;
}

/**
 * Build nested SCSS rules from template nodes, extracting leaf values from each selector
 * Used for structure-based grouping where selectors share the same pattern
 * @param {{selector: string, nodes: Array}[]} selectors - Selectors with same structure
 * @param {import('postcss').Rule} parentRule - Parent PostCSS rule
 * @param {import('postcss').Declaration[]} declarations - Declarations to add to leaf
 * @returns {import('postcss').Rule|null} The leaf rule where declarations were added
 */
export function buildFromTemplate(selectors, parentRule, declarations) {
	if (selectors.length === 0) {
		return null;
	}

	// Use the first selector's structure as the template
	const templateNodes = selectors[0].nodes.slice(1);
	let currentRule = parentRule;

	for (let i = 0; i < templateNodes.length; i++) {
		const node = templateNodes[i];

		// Skip space combinators - they're implicit in nesting
		if (node.type === "combinator" && node.value === COMBINATORS.SPACE) {
			continue;
		}

		// Extract the actual value from each selector for this position
		const leafValues = selectors.map((s) => {
			const selNode = s.nodes[i + 1]; // +1 because we sliced from index 1
			return selNode.value;
		});

		// Determine if we need & prefix based on the first value
		const prevNode = i > 0 ? templateNodes[i - 1] : null;
		const needsAmpersandPrefix =
			(!prevNode ||
				prevNode.type !== "combinator" ||
				prevNode.value !== COMBINATORS.SPACE) &&
			(leafValues[0].startsWith(":") ||
				leafValues[0].startsWith(".") ||
				leafValues[0].startsWith("#"));

		// Build leaf selector with grouped values
		const leafSelector = needsAmpersandPrefix
			? `&${leafValues.join(", &")}`
			: leafValues.join(", ");

		const newRule = postcss.rule({ selector: leafSelector });
		currentRule.append(newRule);
		currentRule = newRule;
	}

	// Add declarations to leaf rule
	for (const decl of declarations) {
		currentRule.append(decl.clone());
	}

	return currentRule;
}

/**
 * Build parent rules from LCP path (trie keys)
 * @param {string[]} path - Array of trie keys representing the LCP path
 * @param {function} parseKey - Function to parse trie keys (SelectorTrie.parseKey)
 * @param {import('postcss').Root} root - PostCSS root to append to
 * @returns {import('postcss').Rule|null} The last rule in the path (where divergent selectors go)
 */
export function buildFromPath(path, parseKey, root) {
	if (path.length === 0) {
		return null;
	}

	let currentRule = null;
	let currentDepth = 0;

	for (let i = 0; i < path.length; i++) {
		const key = path[i];
		const { type: nodeType, value } = parseKey(key);

		// Skip space combinators - they're implicit in nesting
		if (nodeType === "combinator" && value === COMBINATORS.SPACE) {
			continue;
		}

		const isFirst = currentDepth === 0;
		let ruleSelector;

		if (isFirst) {
			ruleSelector = value;
		} else {
			// Check if previous node was a combinator
			const prevKey = path[i - 1];
			const { type: prevType } = parseKey(prevKey);
			if (prevType === "combinator") {
				ruleSelector = value;
			} else {
				ruleSelector = `&${value}`;
			}
		}

		const newRule = postcss.rule({ selector: ruleSelector });

		if (isFirst) {
			root.append(newRule);
		} else if (currentRule) {
			currentRule.append(newRule);
		}

		currentRule = newRule;
		currentDepth++;
	}

	return currentRule;
}

/**
 * Build suffix selectors for divergent parts after LCP
 * @param {{selector: string, nodes: Array}[]} selectors - Selectors with same LCP
 * @param {number} pathLength - Length of the LCP path (number of nodes to skip)
 * @param {boolean} lastPathNodeWasSpaceCombinator - Whether last LCP node was a space combinator
 * @returns {string} Comma-separated suffix selectors
 */
export function buildSuffixSelectors(
	selectors,
	pathLength,
	lastPathNodeWasSpaceCombinator,
) {
	return selectors
		.map((s) => {
			const suffixNodes = s.nodes.slice(pathLength);

			// Check if suffix starts with a space combinator
			// This means we're in descendant context
			const startsWithSpaceCombinator = suffixNodes.length > 0 &&
				suffixNodes[0].type === "combinator" &&
				suffixNodes[0].value === COMBINATORS.SPACE;

			// Build the suffix value
			let suffix = suffixNodes.map((n) => n.value).join("");
			let trimmed = suffix.trim();

			// Determine if & prefix is needed:
			// - If LCP path ended with space combinator, suffix is descendant (no &)
			// - If suffix starts with space combinator, first class after is descendant (no &)
			// - Otherwise, if suffix starts with : . or #, it's chained (needs &)
			const needsAmpersand = !lastPathNodeWasSpaceCombinator &&
				!startsWithSpaceCombinator &&
				(trimmed.startsWith(":") ||
					trimmed.startsWith(".") ||
					trimmed.startsWith("#"));

			return needsAmpersand ? `&${trimmed}` : trimmed;
		})
		.join(", ");
}

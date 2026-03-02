/**
 * @module structure-grouper
 *
 * Module for grouping selectors by structural pattern.
 *
 * Used when there's no LCP (Longest Common Prefix) but selectors share
 * similar structure, enabling aggressive nesting optimization.
 *
 * ## Strategy:
 * - Build structure keys from node type patterns (e.g., "class|pseudo")
 * - Group selectors with matching structures
 * - Generate nested SCSS from grouped selectors
 *
 * ## Example:
 * ```javascript
 * // .a:hover, .b:focus → both have structure "class|pseudo"
 * // Output: .a, .b { &:hover, &:focus { ... } }
 * ```
 *
 * @see {@link reduce-transformer.js}
 */

import postcss from "postcss";
import { buildFromTemplate } from "./selector-builder.js";
import { COMBINATORS } from "./selector-trie.js";

/**
 * Check if a selector group contains non-space combinators
 * @param {Array<{type: string, value: string}>} nodes - Parsed selector nodes
 * @returns {boolean} True if contains non-space combinators
 */
function hasNonSpaceCombinators(nodes) {
	return nodes.some(
		(n) => n.type === "combinator" && n.value !== COMBINATORS.SPACE,
	);
}

/**
 * Build a structure key that includes ALL node types
 * @param {Array<{type: string, value: string}>} nodes - Parsed selector nodes
 * @returns {string} Structure key
 */
export function buildStructureKey(nodes) {
	if (nodes.length === 0) return "empty";
	return nodes.map((n) => n.type).join("|");
}

/**
 * Check if selectors have compatible structure for grouping
 * @param {Array<{nodes: Array}>} selectors - Selectors to check
 * @returns {boolean} True if can be grouped together
 */
export function canGroupTogether(selectors) {
	if (selectors.length < 2) return true;

	// Check if all selectors have the same structure
	const firstStructure = buildStructureKey(selectors[0].nodes);
	return selectors.every((s) => buildStructureKey(s.nodes) === firstStructure);
}

/**
 * Group selectors by structure pattern
 * @param {Array<{selector: string, nodes: Array}>} selectors - Selectors to group
 * @returns {Map<string, Array<{selector: string, nodes: Array}>>} Groups by structure key
 */
export function groupByStructure(selectors) {
	const groups = new Map();

	for (const sel of selectors) {
		const key = buildStructureKey(sel.nodes);
		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key).push(sel);
	}

	return groups;
}

/**
 * Build nested rules from a structure group
 * @param {Array<{selector: string, nodes: Array}>} group - Selectors with same structure
 * @param {Array} declarations - Declarations to add
 * @param {import('postcss').Root} root - PostCSS root to append to
 * @returns {boolean} True if grouping was applied, false if should use flat output
 */
export function buildStructureGroup(group, declarations, root) {
	if (group.length === 0) return false;

	// Check if template nodes contain non-space combinators
	const templateNodes = group[0].nodes.slice(1);
	const hasNonSpaceInTemplate = hasNonSpaceCombinators(templateNodes);

	if (hasNonSpaceInTemplate) {
		// Cannot group selectors with non-space combinators
		return false;
	}

	// If there are no template nodes (just first node), group all selectors
	if (templateNodes.length === 0) {
		const flatSelector = group.map((s) => s.selector).join(", ");
		const flatRule = postcss.rule({ selector: flatSelector });
		root.append(flatRule);
		for (const decl of declarations) {
			flatRule.append(decl.clone());
		}
		return true;
	}

	// Extract first nodes and build parent rule
	const firstNodes = group.map((s) => s.nodes[0].value);
	const parentRule = postcss.rule({ selector: firstNodes.join(", ") });
	root.append(parentRule);

	// Use buildFromTemplate helper for nested structure
	buildFromTemplate(group, parentRule, declarations);

	return true;
}

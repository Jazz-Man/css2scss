import postcss from "postcss";

/**
 * Module for grouping selectors by structural pattern
 * Used when there's no LCP (Longest Common Prefix) but selectors share similar structure
 */

/**
 * Check if a selector group contains non-space combinators
 * @param {Array<{type: string, value: string}>} nodes - Parsed selector nodes
 * @returns {boolean} True if contains non-space combinators
 */
function hasNonSpaceCombinators(nodes) {
	return nodes.some((n) => n.type === "combinator" && n.value !== " ");
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

	// Build nested structure, extracting leaf values from each selector
	let currentRule = parentRule;
	for (let i = 0; i < templateNodes.length; i++) {
		const node = templateNodes[i];

		// Skip space combinators - they're implicit in nesting
		if (node.type === "combinator" && node.value === " ") {
			continue;
		}

		// Extract the actual value from each selector for this position
		const leafValues = group.map((s) => {
			const selNode = s.nodes[i + 1]; // +1 because we sliced from index 1
			return selNode.value;
		});

		// Determine if we need & prefix
		const prevNode = i > 0 ? templateNodes[i - 1] : null;
		const needsAmpersand =
			(!prevNode || prevNode.type !== "combinator" || prevNode.value !== " ") &&
			(leafValues[0].startsWith(":") ||
				leafValues[0].startsWith(".") ||
				leafValues[0].startsWith("#"));

		// Build leaf selector with grouped values
		const leafSelector = needsAmpersand
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

	return true;
}

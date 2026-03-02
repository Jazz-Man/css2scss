import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Get the "structure" of a selector for grouping purposes
 * Structure is the sequence of node types (excluding the first node's value)
 * @param {import('postcss-selector-parser').Selector} sel
 * @returns {string[]} Array of node types/values representing the nesting structure
 */
function getSelectorStructure(sel) {
	const structure = [];
	let first = true;

	sel.each((node) => {
		if (first) {
			first = false;
			return; // Skip first node - it varies per selector
		}

		if (node.type === "combinator") {
			structure.push(`comb:${node.value}`);
		} else if (node.type === "class") {
			structure.push("class");
		} else if (node.type === "pseudo") {
			structure.push(`pseudo:${node.value}`);
		} else if (node.type === "id") {
			structure.push("id");
		} else if (node.type === "tag") {
			structure.push("tag");
		} else if (node.type === "attribute") {
			structure.push("attr");
		} else {
			structure.push(node.type);
		}
	});

	return structure;
}

/**
 * Extract the first node's selector from a selector
 * @param {import('postcss-selector-parser').Selector} sel
 * @returns {string} The first node as a string
 */
function getFirstNodeSelector(sel) {
	const first = sel.first;
	return first ? first.toString() : sel.toString();
}

/**
 * Build nested rules from a group of selectors with the same structure
 * @param {{selectors: import('postcss-selector-parser').Selector[], templateSel: import('postcss-selector-parser').Selector}} group
 * @param {import('postcss').Declaration[]} declarations
 * @param {import('postcss').Root} root
 */
function buildNestedRules(group, declarations, root) {
	const { selectors, templateSel } = group;
	const firstNodeSelectors = selectors.map(getFirstNodeSelector).map((s) => s.trim());

	/** @type {import('postcss').Rule|null} */
	let currentRule = null;
	let nodeIndex = 0;

	templateSel.each((node) => {
		if (node.type === "combinator" && node.value === " ") {
			return;
		}

		const prevNode = node.prev();
		let selector;

		if (!prevNode) {
			// First node - use comma-separated selectors
			selector = firstNodeSelectors.join(", ");
		} else if (prevNode.type === "combinator" && prevNode.value === " ") {
			selector = node.toString();
		} else {
			selector = `&${node.toString()}`;
		}

		if (nodeIndex === 0) {
			currentRule = postcss.rule({ selector });
			root.append(currentRule);
		} else {
			const newRule = postcss.rule({ selector });
			if (currentRule) {
				currentRule.append(newRule);
				currentRule = newRule;
			}
		}

		nodeIndex++;
	});

	// Add declarations to the leaf rule
	if (currentRule) {
		for (const decl of declarations) {
			currentRule.append(decl.clone());
		}
	}
}

/**
 * Transforms a CSS selector string into nested SCSS rules using reduce approach
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
		declarations = [postcss.decl({ prop: "width", value: "378px" })];
	} else if (!Array.isArray(declarations)) {
		declarations = [declarations];
	}

	/** @type {Map<string, {selectors: import('postcss-selector-parser').Selector[], templateSel: import('postcss-selector-parser').Selector}>} */
	const structureGroups = new Map();

	selectorParser((selectors) => {
		selectors.each((sel) => {
			if (!sel || sel.length === 0) return true;

			const structure = getSelectorStructure(sel).join("|");

			if (!structureGroups.has(structure)) {
				structureGroups.set(structure, {
					selectors: [],
					templateSel: sel,
				});
			}

			structureGroups.get(structure)?.selectors.push(sel);
			return true;
		});
	}).processSync(selectorString);

	// Build nested rules for each structure group
	for (const group of structureGroups.values()) {
		buildNestedRules(group, declarations, newRoot);
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

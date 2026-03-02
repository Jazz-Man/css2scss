import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Transforms a CSS selector string into nested SCSS rules using reduce approach
 * @param {string} selectorString - CSS selector (e.g., ".a.b, .c:hover")
 * @param {object} options - Options
 * @param {import('postcss').Declaration|import('postcss').Declaration[]} options.declarations Declaration(s) to add to leaf rules (single or array)
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

	/**
	 * Append all declarations (cloned) to a rule
	 * @param {import('postcss').Rule} rule
	 */
	function appendDeclarations(rule) {
		for (const decl of declarations) {
			rule.append(decl.clone());
		}
	}

	/**
	 * @param {import('postcss-selector-parser').Node} node
	 * @returns {string}
	 */
	function getNodeSelector(node) {
		const prevNode = node.prev();
		const nodeSelector = node.toString();

		if (!prevNode) {
			return nodeSelector;
		}

		return prevNode?.type === "combinator" && prevNode?.value === " "
			? nodeSelector
			: `&${nodeSelector}`;
	}

	selectorParser((selectors) => {
		// Process ALL selectors, not just at(0)
		selectors.each((sel) => {
			if (!sel || sel.length === 0) return true;

			if (sel.length > 1) {
				const lastIndex = sel.last.sourceIndex;

				sel.reduce((prevRule, node) => {
					const prevNode = node.prev();

					if (node.sourceIndex === lastIndex) {
						if (prevRule) {
							const newRule = postcss.rule({
								selector: getNodeSelector(node),
							});
							appendDeclarations(newRule);
							prevRule.append(newRule);
							return newRule;
						}
					}

					if (node.type === "combinator" && node.value === " ") {
						return prevRule;
					}

					if (!prevNode) {
						const newRule = postcss.rule({ selector: getNodeSelector(node) });
						newRoot.append(newRule);
						return newRule;
					}

					const newRule = postcss.rule({ selector: getNodeSelector(node) });
					prevRule.append(newRule);
					return newRule;
				}, undefined);
			} else {
				const newRule = postcss.rule({ selector: getNodeSelector(sel.first) });
				appendDeclarations(newRule);
				newRoot.append(newRule);
			}
		});
	}).processSync(selectorString);

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

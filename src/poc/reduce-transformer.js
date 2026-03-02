import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Transforms a CSS selector string into nested SCSS rules using reduce approach
 * @param {string} selectorString - CSS selector (e.g., ".a.b, .c:hover")
 * @param {object} options - Options
 * @param {import('postcss').Declaration} options.declaration - Declaration to add to leaf rules
 * @returns {import('postcss').Root} PostCSS Root with nested rules
 */
export function transformSelectorReduce(selectorString, options = {}) {
	const newRoot = postcss.root();
	const declaration =
		options.declaration || postcss.decl({ prop: "width", value: "378px" });

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
							const newRule = postcss
								.rule({ selector: getNodeSelector(node) })
								.append(declaration.clone());

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
				newRoot.append(
					postcss
						.rule({ selector: getNodeSelector(sel.first) })
						.append(declaration.clone()),
				);
			}
		});
	}).processSync(selectorString);

	return newRoot;
}

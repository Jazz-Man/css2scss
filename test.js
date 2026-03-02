import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

import debug from "./src/utils/debug";

const newRoot = postcss.root();

const loremDecl = postcss.decl({ prop: "width", value: "378px" });

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
	const sel = selectors.at(0);
	if (!sel) return;

	if (sel.length > 1) {
		const lastIndex = sel.last.sourceIndex;

		sel.reduce((prevRule, node) => {
			const prevNode = node.prev();

			if (node.sourceIndex === lastIndex) {
				if (prevRule) {
					const newRule = postcss
						.rule({ selector: getNodeSelector(node) })
						.append(loremDecl);

					prevRule.append(newRule);

					return newRule;
				}
			}

			if (node.type === "combinator" && node.value === " ") {
				return prevRule;
			}

			if (!prevNode) {
				/** @type {import('postcss').Rule} */
				prevRule = postcss.rule({ selector: getNodeSelector(node) });
				newRoot.append(prevRule);

				return prevRule;
			}

			const newRule = postcss.rule({ selector: getNodeSelector(node) });

			prevRule.append(newRule);

			return newRule;
		}, undefined);
	} else {
		newRoot.append(
			postcss.rule({ selector: getNodeSelector(sel.first) }).append(loremDecl),
		);
	}
}).processSync(
	// ".ArticleCard_card",
	// ".ArticleCard_card .Test",
	// ".ArticleCard_card, .Test",
	".ArticleCard_card.Test",
	// '.ArticleCard_card.Test [data-test="some-value"] .Some-more-selectors #id-element div .more-selectors.and-more:hover .test-last-class:before',
);

console.log(newRoot.toString());

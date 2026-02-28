import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import createSort from "sort-css-media-queries/create-sort";
import debug from "../utils/debug";

const sortCSSmq2 = createSort({ unitlessMqAlwaysFirst: true });

/**
 *
 * @param {import('postcss').Root} root
 * @param {{comments: boolean}} options
 * @returns {import('postcss').Root}
 */
export function transform(root, options = {}) {
	const { comments = true } = options;

	if (!comments) {
		root.walkComments((comment) => comment.remove());
	}

	const atRules = [];

	/** @type {import('postcss').Root} */
	// const newRoot = postcss.root();

	root.walkAtRules("media", (atRule) => {
		if (atRule.parent?.type === "root") {
			const query = atRule.params;
			if (!atRules[query]) {
				atRules[query] = postcss.atRule({
					name: atRule.name,
					params: atRule.params,
					source: atRule.source,
				});
			}

			atRule.nodes.forEach((node) => {
				atRules[query].append(node.clone());
			});

			atRule.remove();
		}
	});

	// if (atRules) {
	// 	sortAtRules(Object.keys(atRules)).forEach((query) => {
	// 		// root.append(atRules[query]);
	// 	});
	// }

	root = applyNesting(root);

	return root;
}

function sortAtRules(queries) {
	return queries.sort(sortCSSmq2);
}

/**
 *
 * @param {import('postcss').Root} root
 * @returns
 */
function applyNesting(root) {
	/** @type {import('postcss').Root} */
	const newRoot = postcss.root();

	/** @type {Map<string, import('postcss').Rule>} */
	const selectorMap = new Map();

	// Зберігаємо ВСІ at-rules
	root.walkAtRules((atRule) => {
		newRoot.append(atRule.clone());
	});

	/** @type {Array<{ selector: string, decls: Array<import('postcss').Declaration> }>} */
	const rulesToProcess = [];

	root.walkRules((cssRule, index) => {
		if (cssRule.parent.type === "root") {
			/** @type {Map<string, import('postcss').Rule>} */
			const selectorMap = new Map();

			selectorParser((selectorAst) => {
				if (!selectorAst.source) {
					return;
				}

				// комбіновані селектори, тобто  ".class-one,.class-two,.class-three, * >"
				if (selectorAst.length > 1) {
				} else {
					if (selectorAst.first.length === 1) {
						const baseRool = postcss.rule({
							selector: selectorAst.first.toString(),
						});

						newRoot.append(baseRool);

						cssRule.walkDecls((decl) => {
							baseRool.append(decl.clone());
						});

						selectorMap.set(selectorAst.first.toString(), baseRool);
					} else {
						const rootSelector = selectorAst.first.toString();
						const baseSelector = selectorAst.first.first.toString();

						/** @type {import('postcss').Rule} */
						const baseRule = selectorMap.has(baseSelector)
							? selectorMap.get(baseSelector)
							: postcss.rule({
									selector: baseSelector,
								});

						newRoot.append(baseRule);

						const rule = selectorAst.first.reduce(
							(prevCssSelector, currentNode, currentIndex, array) => {
								const selector = currentNode.toString().trim();
								const prevType = currentNode.prev()?.type;
								const nextType = currentNode.next()?.type;
								const prevSelector = currentNode.prev()?.toString().trim();
								const nextSelector = currentNode.next()?.toString().trim();
								const hasPrev = prevSelector?.length > 0;
								const hasNext = nextSelector?.length > 0;

								debug({
									selector,
									prevType,
									nextType,
									prevSelector,
									nextSelector,
									hasPrev,
									hasNext,
								});

								return prevCssSelector;
							},
							undefined,
						);

						// baseRule.append(rule);

						// debug(rule);

						// selectorAst.first.nodes.forEach((node, index) => {
						// 	if (index === 0) {
						// 		return;
						// 	}
						// 	debug(node.toString());
						// });

						// selectorAst.walk((node, index) => {
						// 	switch (node.type) {
						// 		case "selector":
						// 			break;
						// 		default: {
						// 			const currentSelector = node.toString().trim();
						// 			const prevType = node.prev()?.type;
						// 			const nextType = node.next()?.type;
						// 			const prevSelector = node.prev()?.toString().trim();
						// 			const nextSelector = node.next()?.toString().trim();
						// 			const hasPrev = prevSelector?.length > 0;
						// 			const hasNext = nextSelector?.length > 0;
						// 			const isOne = !hasPrev && !hasNext;
						// 			if (isOne) {
						// 				console.log({
						// 					type: node.type,
						// 					isOne,
						// 					currentSelector,
						// 					currentSelectorRaw: node.toString(),
						// 					prevSelector,
						// 					prevType,
						// 					hasPrev,
						// 					nextSelector,
						// 					nextType,
						// 					hasNext,
						// 				});
						// 			}
						// 			// if (
						// 			// 	typeof nextSelector === "undefined" ||
						// 			// 	nextSelector?.length === 0
						// 			// ) {
						// 			// 	const newRoot = postcss.root();
						// 			// 	const rule = postcss.rule({
						// 			// 		selector: ".some-prev-selector",
						// 			// 	});
						// 			// 	const rule1 = postcss.rule({
						// 			// 		selector: `&${currentSelector}`,
						// 			// 	});
						// 			// 	rule.append(rule1);
						// 			// 	newRoot.append(rule);
						// 			// 	cssRule.walkDecls((decl) => {
						// 			// 		rule1.append(decl.clone());
						// 			// 	});
						// 			// 	// console.log(newRoot.toString());
						// 			// }
						// 			break;
						// 		}
						// 	}
						// });
					}
				}
			}).processSync(cssRule.selector, {
				lossless: false,
			});

			// 	const parsed = parseSelector(rule.selector);
			// 	const baseSelector = parsed.at(0);
			// 	if (parsed.length === 1) {
			// 		addRuleToRoot(
			// 			newRoot,
			// 			baseSelector,
			// 			collectDeclarations(rule),
			// 			selectorMap,
			// 		);
			// 	} else {
			// 		const nestedSelector = parsed.slice(1).join(" ");
			// 		const parentRule = findOrCreateRule(newRoot, baseSelector, selectorMap);
			// 		if (parentRule) {
			// 			const finalSelector = buildNestedSelector(nestedSelector);
			// 			// console.log({ baseSelector, nestedSelector, finalSelector, parsed });
			// 		}
			// 	}
			// 	// rulesToProcess.push({
			// 	// 	selector: rule.selector,
			// 	// 	decls: collectDeclarations(rule),
			// 	// });
		}
	});

	console.log(newRoot.toString());

	// Обробляємо кожне правило
	// for (const { selector, decls } of rulesToProcess) {
	// 	const allSelectors = selector
	// 		.split(",")
	// 		.map((s) => s.trim())
	// 		.filter((s) => s);

	// 	for (const fullSelector of allSelectors) {
	// 		const parsed = parseSelector(fullSelector);

	// 		if (parsed.length === 0) continue;

	// 		if (parsed.length === 1) {
	// 			addRuleToRoot(newRoot, parsed[0], decls, selectorMap);
	// 		} else {
	// 			const baseSelector = parsed[0];
	// 			const nestedSelector = parsed.slice(1).join(" ");

	// 			const parentRule = findOrCreateRule(newRoot, baseSelector, selectorMap);
	// 			if (parentRule) {
	// 				const finalSelector = buildNestedSelector(nestedSelector);

	// 				const existingNested = findNestedRule(parentRule, finalSelector);
	// 				let nestedRule = existingNested;

	// 				if (!nestedRule) {
	// 					nestedRule = postcss.rule({
	// 						selector: finalSelector,
	// 						raws: { before: "\n  ", between: " {\n", after: "\n  }" },
	// 					});
	// 					parentRule.append(nestedRule);
	// 				}

	// 				for (const decl of decls) {
	// 					nestedRule.append(
	// 						postcss.decl({
	// 							prop: decl.prop,
	// 							value: decl.value,
	// 							important: decl.important,
	// 							raws: { before: "\n    ", between: ": " },
	// 						}),
	// 					);
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	// Переміщуємо декларації перед вкладеними правилами
	newRoot.walkRules((rule) => {
		if (rule.parent.type === "root") {
			const decls = [];
			const rules = [];

			rule.each((node) => {
				if (node.type === "decl") decls.push(node);
				else if (node.type === "rule") rules.push(node);
			});

			if (decls.length > 0 && rules.length > 0) {
				rule.removeAll();
				decls.map((d) => rule.append(d));
				rules.map((r) => rule.append(r));
			}
		}
	});

	return newRoot;
}

/**
 *
 * @param {string} selector
 * @returns {string[]}
 */
function parseSelector(selector) {
	/** @type {string[]} */
	const parts = [];

	try {
		selectorParser((ast) => {
			ast.walk((node) => {
				switch (node.type) {
					// case "root":
					case "selector": {
						debug(node, {
							showHidden: true,
							colors: true,
						});

						break;
					}
					// case "combinator":
					// case "pseudo":
					// case "attribute":
					// case "class":
					// case "id":
					// case "tag": {
					// 	const value = node.toString().trim();
					// 	if (value.length === 0) {
					// 		break;
					// 	}

					// 	parts.push(value);

					// 	break;
					// }
					// case "universal": {
					// 	const value = node.toString().trim();
					// 	if (value.length === 0) {
					// 		break;
					// 	}

					// 	parts.push(value);
					// 	break;
					// }
					default:
						// console.log(node.type);
						break;
				}
			});
		}).processSync(selector, {
			lossless: false,
		});
	} catch (error) {
		console.warn(`Selector parser fallback for: ${selector}`);
		return selector.split(/\s+/).filter((p) => p);
	}

	return parts;
}

/**
 *
 * @param {string} selector
 * @returns {string}
 */
function buildNestedSelector(selector) {
	if (selector.includes("&")) return selector;
	if (selector.startsWith(":") || selector.startsWith("::"))
		return `&${selector}`;
	if (selector.startsWith("[")) {
		return `&${selector}`;
	}
	if (
		selector.startsWith(">") ||
		selector.startsWith("+") ||
		selector.startsWith("~")
	)
		return selector;
	return selector;
}

/**
 *
 * @param {import('postcss').Root} root
 * @param {string} selector
 * @param {import('postcss').Declaration[]>} decls
 * @param {Map<string, import('postcss').Rule>} selectorMap
 */
function addRuleToRoot(root, selector, decls, selectorMap) {
	let rule = selectorMap.get(selector);

	if (!rule) {
		rule = postcss.rule({
			selector,
		});
		root.append(rule);
		selectorMap.set(selector, rule);
	}

	for (const decl of decls) {
		rule.append(
			postcss.decl({
				prop: decl.prop,
				value: decl.value,
				important: decl.important,
			}),
		);
	}
}

/**
 *
 * @param {import('postcss').Root} root
 * @param {string} selector
 * @param {Map<string, import('postcss').Rule>} selectorMap
 * @returns {import('postcss').Rule}
 */
function findOrCreateRule(root, selector, selectorMap) {
	let rule = selectorMap.get(selector);

	if (!rule) {
		rule = postcss.rule({
			selector,
		});
		root.append(rule);
		selectorMap.set(selector, rule);
	}

	return rule;
}

/**
 *
 * @param {import('postcss').Rule} parentRule
 * @param {string} selector
 * @returns {import('postcss').Rule|null}
 */
function findNestedRule(parentRule, selector) {
	let found = null;
	parentRule.walkRules((rule) => {
		if (rule.selector === selector) {
			found = rule;
			return false;
		}
	});
	return found;
}

/**
 *
 * @param {import('postcss').Rule} rule
 * @returns {import('postcss').Declaration[]}
 */
function collectDeclarations(rule) {
	/** @type {import('postcss').Declaration[]} */
	const decls = [];
	rule.walkDecls((decl) => {
		decls.push({
			prop: decl.prop,
			value: decl.value,
			important: decl.important || false,
		});
	});
	return decls;
}

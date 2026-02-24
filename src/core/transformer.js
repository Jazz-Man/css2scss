import postcss from "postcss";

export function transform(root, options = {}) {
	const {
		nest = false,
		nestDepth = 3,
		variables = false,
		varThreshold = 3,
		groupProperties = false,
		comments = true,
	} = options;

	if (!comments) {
		root.walkComments((comment) => {
			comment.remove();
		});
	}

	if (nest) {
		root = applyNesting(root, nestDepth);
	}

	if (variables) {
		extractVariables(root, varThreshold);
	}

	if (groupProperties) {
		groupPropertyPrefixes(root);
	}

	return root;
}

/**
 * Вкладення селекторів через побудову дерева даних
 */
function applyNesting(root, maxDepth) {
	const newRoot = postcss.root();

	// Збираємо всі правила
	const regularRules = [];
	const mediaRules = [];

	root.walkRules((rule) => {
		const selector = rule.selector.split(",")[0].trim();
		const parts = selector.split(/\s+/).filter((p) => p);

		if (rule.parent.type === "atrule") {
			const media = rule.parent;
			mediaRules.push({
				decls: collectDeclarations(rule),
				mediaParams: media.params,
				parts,
				baseSelector: parts[0],
			});
		} else {
			regularRules.push({
				decls: collectDeclarations(rule),
				parts,
				baseSelector: parts[0],
			});
		}
	});

	// Будуємо дерево селекторів
	const tree = buildSelectorTree(regularRules, maxDepth);

	// Додаємо медіа-запити до відповідних вузлів дерева
	for (const mediaRule of mediaRules) {
		addMediaToTree(tree, mediaRule, maxDepth);
	}

	// Генеруємо новий AST з дерева
	generateASTFromTree(tree, newRoot, 0);

	return newRoot;
}

/**
 * Збирає всі декларації з правила в масив
 */
function collectDeclarations(rule) {
	const decls = [];
	rule.walkDecls((decl) => {
		decls.push({
			prop: decl.prop,
			value: decl.value,
			raws: { ...decl.raws },
		});
	});
	return decls;
}

/**
 * Будує дерево селекторів з правил
 */
function buildSelectorTree(rules, maxDepth) {
	const tree = new Map();

	for (const { decls, parts, baseSelector } of rules) {
		if (parts.length === 0) continue;
		if (parts.length > maxDepth) continue;

		// Створюємо базовий вузол якщо не існує
		if (!tree.has(baseSelector)) {
			tree.set(baseSelector, {
				decls: [],
				children: new Map(),
				media: [],
			});
		}

		const baseNode = tree.get(baseSelector);

		// Якщо це базовий селектор (1 частина) - додаємо декларації до нього
		if (parts.length === 1) {
			baseNode.decls.push(...decls);
		} else {
			// Якщо це вкладений селектор - будуємо ланцюжок дітей
			let currentNode = baseNode;

			for (let i = 1; i < parts.length; i++) {
				const part = parts[i];
				const isLast = i === parts.length - 1;

				if (!currentNode.children.has(part)) {
					currentNode.children.set(part, {
						decls: [],
						children: new Map(),
						media: [],
					});
				}

				// Додаємо декларації тільки до кінцевого вузла
				if (isLast) {
					currentNode.children.get(part).decls.push(...decls);
				}

				currentNode = currentNode.children.get(part);
			}
		}
	}

	return tree;
}

/**
 * Додає медіа-запити до відповідних вузлів дерева
 */
function addMediaToTree(tree, mediaRule, maxDepth) {
	const { decls, mediaParams, parts, baseSelector } = mediaRule;

	if (parts.length === 0) return;

	const baseNode = tree.get(baseSelector);
	if (!baseNode) return;

	if (parts.length === 1) {
		// Медіа для базового селектора
		baseNode.media.push({
			params: mediaParams,
			decls,
			selector: "&",
		});
	} else {
		// Медіа для вкладеного селектора
		let currentNode = baseNode;

		for (let i = 1; i < parts.length; i++) {
			const part = parts[i];
			if (currentNode.children.has(part)) {
				currentNode = currentNode.children.get(part);
			} else {
				return; // Шлях не існує
			}
		}

		// Додаємо медіа до кінцевого вузла
		currentNode.media.push({
			params: mediaParams,
			decls,
			selector: "&",
		});
	}
}

/**
 * Генерує PostCSS AST з дерева селекторів
 */
function generateASTFromTree(tree, parent, depth) {
	const indent = "  ".repeat(depth);

	for (const [selector, node] of tree) {
		const rule = postcss.rule({
			selector,
			raws: {
				before: depth === 0 ? "\n" : `\n${indent}`,
				between: " {\n",
				after: `\n${indent}}`,
			},
		});

		// Додаємо декларації
		for (const decl of node.decls) {
			rule.append(
				postcss.decl({
					prop: decl.prop,
					value: decl.value,
					raws: { before: `\n${indent}  `, between: ": " },
				}),
			);
		}

		// Додаємо медіа-запити
		for (const media of node.media) {
			const mediaRule = postcss.atRule({
				name: "media",
				params: media.params,
				raws: {
					before: `\n${indent}  `,
					between: " {\n",
					after: `\n${indent}  }`,
				},
			});

			const nestedRule = postcss.rule({
				selector: media.selector,
				raws: {
					before: `\n${indent}    `,
					between: " {\n",
					after: `\n${indent}    }`,
				},
			});

			for (const decl of media.decls) {
				nestedRule.append(
					postcss.decl({
						prop: decl.prop,
						value: decl.value,
						raws: { before: `\n${indent}      `, between: ": " },
					}),
				);
			}

			mediaRule.append(nestedRule);
			rule.append(mediaRule);
		}

		// Рекурсивно додаємо дітей
		if (node.children.size > 0) {
			generateASTFromTree(node.children, rule, depth + 1);
		}

		parent.append(rule);
	}
}

/**
 * Виділення повторюваних значень у змінні
 */
function extractVariables(root, threshold) {
	const valueMap = new Map();

	root.walkDecls((decl) => {
		const value = decl.value.trim();

		if (value.startsWith("var(--")) {
			return;
		}

		if (!valueMap.has(value)) {
			valueMap.set(value, []);
		}

		valueMap.get(value).push(decl);
	});

	let varCounter = 1;

	for (const [value, decls] of valueMap) {
		if (decls.length >= threshold) {
			const varName = `$auto-var-${varCounter++}`;

			// Створюємо декларацію змінної
			const varDecl = postcss.decl({
				prop: varName,
				value: value,
				raws: { before: "\n", between: ": " },
			});

			root.prepend(varDecl);

			// Замінюємо всі входження
			for (const decl of decls) {
				decl.value = varName;
			}
		}
	}
}

/**
 * Групування властивостей з однаковими префіксами
 */
function groupPropertyPrefixes(root) {
	root.walkRules((rule) => {
		const propsByPrefix = new Map();
		const declsToRemove = [];

		rule.walkDecls((decl) => {
			const parts = decl.prop.split("-");
			if (parts.length > 1) {
				const prefix = parts[0];
				if (!propsByPrefix.has(prefix)) {
					propsByPrefix.set(prefix, []);
				}
				propsByPrefix.get(prefix).push(decl);
			}
		});

		for (const [prefix, decls] of propsByPrefix) {
			if (decls.length >= 2) {
				const allSamePrefix = decls.every((d) =>
					d.prop.startsWith(prefix + "-"),
				);

				if (allSamePrefix) {
					const nestedRule = postcss.rule({
						selector: prefix,
						raws: {
							before: "\n    ",
							between: " {\n",
							after: "\n  }",
						},
					});

					for (const decl of decls) {
						const suffix = decl.prop.replace(prefix + "-", "");
						nestedRule.append(
							postcss.decl({
								prop: suffix,
								value: decl.value,
								raws: { before: "\n      ", between: ": " },
							}),
						);
						declsToRemove.push(decl);
					}

					rule.append(nestedRule);
				}
			}
		}

		for (const decl of declsToRemove) {
			decl.remove();
		}
	});
}

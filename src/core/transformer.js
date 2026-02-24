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
		applySmartNesting(root, nestDepth);
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
 * Розумне вкладення з побудовою дерева селекторів
 */
function applySmartNesting(root, maxDepth) {
	// Крок 1: Збираємо всі правила та медіа-запити
	const rules = [];
	const mediaQueries = [];

	root.walkRules((rule) => {
		if (rule.parent.type === "atrule") {
			mediaQueries.push({
				rule,
				media: rule.parent,
				selector: rule.selector.split(",")[0].trim(),
			});
		} else {
			rules.push({
				rule,
				selector: rule.selector.split(",")[0].trim(),
			});
		}
	});

	// Крок 2: Будуємо дерево селекторів
	const tree = buildSelectorTree(rules, maxDepth);

	// Крок 3: Очищаємо корінь від старих правил
	rules.forEach(({ rule }) => {
		if (rule.parent === root) {
			rule.remove();
		}
	});

	// Крок 4: Генеруємо нові вкладені правила з дерева
	for (const [baseSelector, node] of tree) {
		const baseRule = node.rule.clone();
		baseRule.selector = baseSelector;

		// Вкладаємо дочірні селектори
		for (const child of node.children) {
			const nestedRule = child.rule.clone();
			nestedRule.selector = child.selector;
			baseRule.append(nestedRule);
		}

		root.append(baseRule);
	}

	// Крок 5: Обробляємо медіа-запити - вкладаємо у відповідні селектори
	for (const { rule, media, selector } of mediaQueries) {
		const parts = selector.split(/\s+/).filter((p) => p);
		const baseSelector = parts[0];

		// Знаходимо батьківське правило в дереві
		const targetNode = tree.get(baseSelector);

		if (targetNode && targetNode.rule) {
			// Створюємо копію медіа-запиту
			const newMedia = postcss.atRule({
				name: media.name,
				params: media.params,
				raws: { before: "\n  ", between: " {\n", after: "\n  }" },
			});

			// Вкладаємо правило всередину медіа-запиту
			const nestedRule = rule.clone();
			const nestedSelector = parts.length > 1 ? parts.slice(1).join(" ") : "&";
			nestedRule.selector = nestedSelector.startsWith("&")
				? nestedSelector
				: `& ${nestedSelector}`;

			newMedia.append(nestedRule);
			targetNode.rule.append(newMedia);
		}

		// Видаляємо оригінальний медіа-запит якщо він порожній
		if (media.nodes && media.nodes.length === 0) {
			media.remove();
		} else if (
			media.nodes &&
			media.nodes.every((n) => n.type === "rule" && !n.nodes)
		) {
			media.remove();
		}
	}

	// Крок 6: Видаляємо порожні медіа-запити в корені
	root.walkAtRules((atRule) => {
		if (
			atRule.name === "media" &&
			(!atRule.nodes || atRule.nodes.length === 0)
		) {
			atRule.remove();
		}
	});
}

/**
 * Будує дерево селекторів для вкладення
 */
function buildSelectorTree(rules, maxDepth) {
	const tree = new Map();

	// Спочатку додаємо всі базові селектори (перша частина)
	for (const { rule, selector } of rules) {
		const parts = selector.split(/\s+/).filter((p) => p);
		const baseSelector = parts[0];

		if (!tree.has(baseSelector)) {
			tree.set(baseSelector, {
				rule: rule.clone(),
				children: [],
				depth: 1,
			});
		}
	}

	// Потім вкладаємо дочірні селектори
	for (const { rule, selector } of rules) {
		const parts = selector.split(/\s+/).filter((p) => p);

		if (parts.length === 1) {
			continue; // Це базовий селектор, вже доданий
		}

		if (parts.length > maxDepth) {
			continue; // Перевищено максимальну глибину
		}

		const baseSelector = parts[0];
		const parentNode = tree.get(baseSelector);

		if (parentNode) {
			// Створюємо вкладений селектор
			const nestedSelector = parts.slice(1).join(" ");

			// Перевіряємо чи не дублюється вже такий селектор
			const exists = parentNode.children.some(
				(child) => child.selector === nestedSelector,
			);

			if (!exists) {
				const clonedRule = rule.clone();
				clonedRule.removeAll(); // Видаляємо дочірні елементи, залишаємо тільки декларації

				parentNode.children.push({
					rule: clonedRule,
					selector: nestedSelector,
					depth: parts.length,
				});
			}
		}
	}

	// Рекурсивне вкладення для глибоких селекторів (3+ рівні)
	applyRecursiveTreeNesting(tree, maxDepth);

	return tree;
}

/**
 * Рекурсивно вкладає глибокі селектори один в одного
 */
function applyRecursiveTreeNesting(tree, maxDepth) {
	for (const [baseSelector, node] of tree) {
		if (node.children.length === 0) continue;

		// Групуємо дітей за їхнім першим селектором
		const childGroups = new Map();

		for (const child of node.children) {
			const parts = child.selector.split(/\s+/).filter((p) => p);
			if (parts.length > 1) {
				const firstPart = parts[0];
				if (!childGroups.has(firstPart)) {
					childGroups.set(firstPart, []);
				}
				childGroups.get(firstPart).push(child);
			}
		}

		// Вкладаємо групи дітей
		for (const [firstPart, children] of childGroups) {
			// Знаходимо батьківський вузол для цієї групи
			const parentChild = node.children.find(
				(c) => c.selector === firstPart || c.selector === `& ${firstPart}`,
			);

			if (parentChild) {
				for (const child of children) {
					const parts = child.selector.split(/\s+/).filter((p) => p);
					if (parts.length > 1) {
						// Переміщуємо декларації з дитини в глибоко вкладений селектор
						const nestedSelector = parts.slice(1).join(" ");

						const deepNestedRule = postcss.rule({
							selector: nestedSelector.startsWith("&")
								? nestedSelector
								: `& ${nestedSelector}`,
							raws: { before: "\n    ", between: " {\n", after: "\n  }" },
						});

						// Копіюємо декларації
						child.rule.walkDecls((decl) => {
							deepNestedRule.append(decl.clone());
						});

						if (deepNestedRule.nodes.length > 0) {
							parentChild.rule.append(deepNestedRule);
						}

						// Видаляємо оригінальну дитину з батька
						const index = node.children.indexOf(child);
						if (index > -1) {
							node.children.splice(index, 1);
						}
					}
				}
			}
		}
	}
}

function extractVariables(root, threshold) {
	const valueMap = new Map();

	root.walkDecls((decl) => {
		const value = decl.value.trim();

		if (value.startsWith("var(--")) {
			return;
		}

		if (!valueMap.has(value)) {
			valueMap.set(value, { count: 0, decls: [] });
		}

		const entry = valueMap.get(value);
		entry.count++;
		entry.decls.push(decl);
	});

	let varCounter = 1;
	const variables = [];

	for (const [value, data] of valueMap) {
		if (data.count >= threshold) {
			const varName = `auto-var-${varCounter++}`;
			variables.push({ name: varName, value });

			for (const decl of data.decls) {
				decl.value = `$${varName}`;
			}
		}
	}

	if (variables.length > 0) {
		for (const variable of variables.reverse()) {
			const varDecl = postcss.decl({
				prop: `$${variable.name}`,
				value: variable.value,
				raws: { before: "\n", between: ": " },
			});

			root.prepend(varDecl);
		}
	}
}

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
						raws: { before: "\n    ", between: " {\n", after: "\n  }" },
					});

					for (const decl of decls) {
						const suffix = decl.prop.replace(prefix + "-", "");
						const newDecl = decl.clone({
							prop: suffix,
							raws: { before: "\n      ", between: ": " },
						});
						nestedRule.append(newDecl);
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

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
		applyNesting(root, nestDepth);
		cleanupEmptyAtRules(root);
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
 * Видаляє порожні @media та інші at-rules після вкладення
 */
function cleanupEmptyAtRules(root) {
	root.walkAtRules((atRule) => {
		if (atRule.nodes && atRule.nodes.length === 0) {
			atRule.remove();
		}
	});
}

/**
 * Покращений алгоритм вкладення з рекурсивною обробкою
 */
function applyNesting(root, maxDepth) {
	// Крок 1: Збираємо всі правила з їхнім контекстом (включаючи @media)
	const allRules = [];

	root.walkRules((rule) => {
		allRules.push({
			rule,
			parent: rule.parent,
			selector: rule.selector.split(",")[0].trim(),
			isInsideMedia: rule.parent.type === "atrule",
		});
	});

	// Крок 2: Будуємо мапу селекторів для пошуку батьків
	const selectorMap = new Map();

	for (const item of allRules) {
		// Ігноруємо правила всередині @media для пошуку батьків
		if (!item.isInsideMedia) {
			selectorMap.set(item.selector, item.rule);
		}
	}

	// Крок 3: Обробляємо правила з @media окремо
	const mediaRules = allRules.filter((item) => item.isInsideMedia);
	const regularRules = allRules.filter((item) => !item.isInsideMedia);

	// Крок 4: Вкладаємо звичайні правила
	for (const item of regularRules) {
		const { rule, selector } = item;
		const parts = selector.split(/\s+/).filter((p) => p);

		if (parts.length > 1 && parts.length <= maxDepth) {
			const parentSelector = parts[0];
			const parentRule = selectorMap.get(parentSelector);

			if (parentRule && parentRule !== rule) {
				const nestedSelector = parts.slice(1).join(" ");
				const finalSelector = nestedSelector.startsWith("&")
					? nestedSelector
					: `& ${nestedSelector}`;

				const nestedRule = rule.clone();
				nestedRule.selector = finalSelector;

				parentRule.append(nestedRule);
				rule.remove();
			}
		}
	}

	// Крок 5: Вкладаємо правила з @media у відповідні батьківські селектори
	for (const item of mediaRules) {
		const { rule, selector } = item;
		const parts = selector.split(/\s+/).filter((p) => p);

		if (parts.length >= 1) {
			const parentSelector = parts[0];
			const parentRule = selectorMap.get(parentSelector);

			if (parentRule) {
				// Клонуємо @media правило
				const mediaRule = rule.parent.clone({
					nodes: [],
				});

				// Створюємо вкладене правило всередині @media
				const nestedSelector =
					parts.length > 1 ? parts.slice(1).join(" ") : "&";

				const finalSelector = nestedSelector.startsWith("&")
					? nestedSelector
					: `& ${nestedSelector}`;

				const nestedRule = rule.clone();
				nestedRule.selector = finalSelector;

				mediaRule.append(nestedRule);
				parentRule.append(mediaRule);
				rule.remove();
			}
		}
	}

	// Крок 6: Рекурсивне вкладення для глибоких селекторів
	applyRecursiveNesting(root, maxDepth);
}

/**
 * Рекурсивно вкладає селектори для глибини 3+ рівнів
 */
function applyRecursiveNesting(root, maxDepth, currentDepth = 1) {
	if (currentDepth >= maxDepth) {
		return;
	}

	const rules = [];
	root.walkRules((rule) => {
		rules.push(rule);
	});

	const selectorMap = new Map();

	for (const rule of rules) {
		const selector = rule.selector.split(",")[0].trim();
		if (!selector.startsWith("&")) {
			selectorMap.set(selector, rule);
		}
	}

	let madeChanges = false;

	for (const rule of rules) {
		const selector = rule.selector.split(",")[0].trim();

		// Пропускаємо вже вкладені селектори на цьому рівні
		if (selector.startsWith("&") || rule.parent.type === "atrule") {
			continue;
		}

		const parts = selector.split(/\s+/).filter((p) => p);

		if (parts.length > 1) {
			const parentSelector = parts.slice(0, parts.length - 1).join(" ");
			const childPart = parts[parts.length - 1];

			// Шукаємо батьківське правило (може бути вже вкладеним)
			let parentRule = null;

			for (const [sel, r] of selectorMap) {
				if (sel === parentSelector || parentSelector.endsWith(sel)) {
					parentRule = r;
					break;
				}
			}

			if (parentRule && parentRule !== rule) {
				const finalSelector = childPart.startsWith("&")
					? childPart
					: `& ${childPart}`;

				const nestedRule = rule.clone();
				nestedRule.selector = finalSelector;

				parentRule.append(nestedRule);
				rule.remove();
				madeChanges = true;
			}
		}
	}

	// Рекурсивний виклик якщо були зміни
	if (madeChanges) {
		applyRecursiveNesting(root, maxDepth, currentDepth + 1);
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

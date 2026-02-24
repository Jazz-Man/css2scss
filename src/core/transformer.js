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

	// Видалення коментарів
	if (!comments) {
		root.walkComments((comment) => {
			comment.remove();
		});
	}

	// Вкладення селекторів
	if (nest) {
		applyNesting(root, nestDepth);
	}

	// Виділення змінних
	if (variables) {
		extractVariables(root, varThreshold);
	}

	// Групування властивостей
	if (groupProperties) {
		groupPropertyPrefixes(root);
	}

	return root;
}

/**
 * Алгоритм вкладення селекторів
 * Групує правила, де селектор дитини починається з селектора батька
 */
function applyNesting(root, maxDepth) {
	const rules = [];

	// Збираємо всі правила в масив
	root.walkRules((rule) => {
		rules.push(rule);
	});

	// Індексуємо правила за їхнім основним селектором
	const ruleMap = new Map();

	for (const rule of rules) {
		// Беремо перший селектор (для спрощення)
		const mainSelector = rule.selector.split(",")[0].trim();
		ruleMap.set(mainSelector, rule);
	}

	// Проходимо по всіх правилах і шукаємо потенційних "батьків"
	for (const rule of rules) {
		const selector = rule.selector.split(",")[0].trim();
		const parts = selector.split(/\s+/).filter((p) => p);

		// Якщо селектор складається з частин (наприклад .parent .child)
		if (parts.length > 1 && parts.length <= maxDepth) {
			// Перша частина - потенційний батько
			const parentSelector = parts[0];
			const parentRule = ruleMap.get(parentSelector);

			// Якщо знайшли батьківське правило
			if (parentRule && parentRule !== rule) {
				// Створюємо вкладений селектор з &
				const nestedSelector = parts.slice(1).join(" ");
				const finalSelector = nestedSelector.startsWith("&")
					? nestedSelector
					: `& ${nestedSelector}`;

				// Клонуємо поточне правило для вкладення
				const nestedRule = rule.clone();
				nestedRule.selector = finalSelector;

				// Додаємо до батьківського правила
				parentRule.append(nestedRule);

				// Видаляємо оригінальне правило з кореня
				rule.remove();
			}
		}
	}
}

function extractVariables(root, threshold) {
	const valueMap = new Map();

	root.walkDecls((decl) => {
		const value = decl.value.trim();

		// Пропускаємо CSS custom properties
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

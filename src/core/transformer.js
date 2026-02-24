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
	}

	if (variables) {
		extractVariables(root, varThreshold);
	}

	if (groupProperties) {
		groupPropertyPrefixes(root);
	}

	return root;
}

function applyNesting(root, maxDepth) {
	const rules = [];

	root.walkRules((rule) => {
		rules.push(rule);
	});

	const selectorMap = new Map();

	for (const rule of rules) {
		const selectors = rule.selector.split(",").map((s) => s.trim());

		for (const selector of selectors) {
			const parts = selector.split(/\s+/).filter((p) => p);
			if (parts.length > 0) {
				const base = parts[0];
				if (!selectorMap.has(base)) {
					selectorMap.set(base, []);
				}
				selectorMap.get(base).push({ rule, selector, parts });
			}
		}
	}

	for (const [base, items] of selectorMap) {
		if (items.length > 1) {
			const parentRule = items.find((i) => i.parts.length === 1);
			const childRules = items.filter(
				(i) => i.parts.length > 1 && i.parts.length <= maxDepth,
			);

			if (parentRule && childRules.length > 0) {
				for (const child of childRules) {
					const nestedSelector = child.parts.slice(1).join(" ");
					const hasPseudo = nestedSelector.includes(":");

					const finalSelector = hasPseudo
						? `&${nestedSelector}`
						: `& ${nestedSelector}`;

					const nestedRule = child.rule.clone();
					nestedRule.selector = finalSelector;
					parentRule.rule.append(nestedRule);

					child.rule.remove();
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
				prop: variable.name,
				value: variable.value,
				raws: { before: "\n", between: ": " },
			});

			varDecl.prop = `$${variable.name}`;

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
					d.prop.startsWith(`${prefix}-`),
				);

				if (allSamePrefix) {
					const nestedRule = postcss.rule({
						selector: prefix,
						raws: { before: "\n  ", between: " {\n", after: "\n  }" },
					});

					for (const decl of decls) {
						const suffix = decl.prop.replace(`${prefix}-`, "");
						const newDecl = decl.clone({
							prop: suffix,
							raws: { before: "\n    ", between: ": " },
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

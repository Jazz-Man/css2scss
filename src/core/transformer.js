import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

export function transform(root, options = {}) {
	const { comments = true } = options;

	if (!comments) {
		root.walkComments((comment) => comment.remove());
	}

	root = applyNesting(root);

	return root;
}

function applyNesting(root) {
	const newRoot = postcss.root();
	const selectorMap = new Map();

	// Зберігаємо ВСІ at-rules
	root.walkAtRules((atRule) => {
		newRoot.append(atRule.clone());
	});

	// Збираємо правила
	const rulesToProcess = [];
	root.walkRules((rule) => {
		if (rule.parent.type === "root") {
			rulesToProcess.push({
				selector: rule.selector,
				decls: collectDeclarations(rule),
			});
		}
	});

	// Обробляємо кожне правило
	for (const { selector, decls } of rulesToProcess) {
		const allSelectors = selector
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s);

		for (const fullSelector of allSelectors) {
			const parsed = parseSelector(fullSelector);

			if (parsed.length === 0) continue;

			if (parsed.length === 1) {
				addRuleToRoot(newRoot, parsed[0], decls, selectorMap);
			} else {
				const baseSelector = parsed[0];
				const nestedSelector = parsed.slice(1).join(" ");

				const parentRule = findOrCreateRule(newRoot, baseSelector, selectorMap);
				if (parentRule) {
					const finalSelector = buildNestedSelector(nestedSelector);

					const existingNested = findNestedRule(parentRule, finalSelector);
					let nestedRule = existingNested;

					if (!nestedRule) {
						nestedRule = postcss.rule({
							selector: finalSelector,
							raws: { before: "\n  ", between: " {\n", after: "\n  }" },
						});
						parentRule.append(nestedRule);
					}

					for (const decl of decls) {
						nestedRule.append(
							postcss.decl({
								prop: decl.prop,
								value: decl.value,
								important: decl.important,
								raws: { before: "\n    ", between: ": " },
							}),
						);
					}
				}
			}
		}
	}

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

// ✅ ВИПРАВЛЕНА ФУНКЦІЯ: Правильний парсинг селекторів
function parseSelector(selector) {
	const parts = [];

	try {
		selectorParser((ast) => {
			ast.walk((node) => {
				if (node.type === "root" || node.type === "selector") return;

				// Комбінатори — зберігаємо для правильного вкладення
				if (node.type === "combinator") {
					const value = node.value.trim();
					if (value === ">" || value === "+" || value === "~") {
						parts.push(value);
					}
					return;
				}

				// Псевдо-класи та псевдо-елементи — БЕЗ пробілів
				if (node.type === "pseudo") {
					parts.push(node.toString());
					return;
				}

				// Атрибути — БЕЗ зайвих пробілів
				if (node.type === "attribute") {
					const attr = node.toString().replace(/\s+/g, "");
					parts.push(attr);
					return;
				}

				// Класи, ID, теги
				if (node.type === "class") {
					parts.push(`.${node.value}`);
				} else if (node.type === "id") {
					parts.push(`#${node.value}`);
				} else if (node.type === "tag") {
					parts.push(node.value);
				} else if (node.type === "universal") {
					parts.push(node.value);
				}
			});
		}).processSync(selector);
	} catch (error) {
		console.warn(`Selector parser fallback for: ${selector}`);
		return selector.split(/\s+/).filter((p) => p);
	}

	return parts.filter((p) => p && p.trim() !== "");
}

function buildNestedSelector(selector) {
	if (selector.includes("&")) return selector;
	if (selector.startsWith(":") || selector.startsWith("::"))
		return "&" + selector;
	if (selector.startsWith("[")) return "&" + selector;
	if (
		selector.startsWith(">") ||
		selector.startsWith("+") ||
		selector.startsWith("~")
	)
		return selector;
	return selector;
}

function addRuleToRoot(root, selector, decls, selectorMap) {
	let rule = selectorMap.get(selector);

	if (!rule) {
		rule = postcss.rule({
			selector,
			raws: { before: "\n", between: " {\n", after: "\n}" },
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
				raws: { before: "\n  ", between: ": " },
			}),
		);
	}
}

function findOrCreateRule(root, selector, selectorMap) {
	let rule = selectorMap.get(selector);

	if (!rule) {
		rule = postcss.rule({
			selector,
			raws: { before: "\n", between: " {\n", after: "\n}" },
		});
		root.append(rule);
		selectorMap.set(selector, rule);
	}

	return rule;
}

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

function collectDeclarations(rule) {
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

import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Finds an existing rule at the given path or creates a new one.
 * Traverses the AST hierarchy, creating nested rules as needed.
 *
 * @param {import('postcss').Root | import('postcss').Rule} root - The root or rule to search in
 * @param {string[]} path - Array of selector strings representing the nesting path
 * @returns {import('postcss').Rule} The found or created rule at the end of the path
 *
 * @example
 * // Finds or creates .a > .b path
 * const rule = findOrCreateRuleAtPath(root, [".a", ">"]);
 */
function findOrCreateRuleAtPath(root, path) {
	let current = root;

	for (const selector of path) {
		let found = null;
		for (const node of current.nodes) {
			if (node.type === "rule" && node.selector === selector) {
				found = node;
				break;
			}
		}

		if (!found) {
			found = postcss.rule({ selector });
			current.append(found);
		}

		current = found;
	}

	return current;
}

/**
 * Extracts all AST nodes from a CSS selector string.
 * Uses postcss-selector-parser to parse and iterate over direct children only.
 *
 * @param {string} selectorStr - The CSS selector string to parse
 * @returns {import('postcss-selector-parser').Node[]} Array of parsed selector nodes
 *
 * @example
 * getNodes(".a:hover") // Returns [class"a", pseudo":hover"]
 */
function getNodes(selectorStr) {
	const nodes = [];
	selectorParser((selectors) => {
		selectors.at(0).each((node) => nodes.push(node));
	}).processSync(selectorStr);
	return nodes;
}

/**
 * Converts an array of parsed selector nodes back to a CSS selector string.
 *
 * @param {import('postcss-selector-parser').Node[]} nodes - Array of selector nodes
 * @returns {string} The concatenated selector string
 *
 * @example
 * nodesToSelector([class"a", pseudo":hover"]) // Returns ".a:hover"
 */
function nodesToSelector(nodes) {
	return nodes.map((n) => n.toString()).join("");
}

/**
 * Splits a CSS selector by descendant space combinators using the parser API.
 * Preserves other combinators (>, +, ~) within each part.
 *
 * @param {string} selectorStr - The CSS selector string to split
 * @returns {string[]} Array of selector parts split by spaces
 *
 * @example
 * splitBySpace(".a .b > .c") // Returns [".a", ".b > .c"]
 */
function splitBySpace(selectorStr) {
	const parts = [];
	selectorParser((selectors) => {
		const sel = selectors.at(0);
		if (!sel) return;

		const groups = sel.split(
			(node) => node.type === "combinator" && node.value === " ",
		);

		parts.push(
			...groups.map((g) =>
				g
					.map((n) => n.toString())
					.join("")
					.trim(),
			),
		);
	}).processSync(selectorStr);

	return parts;
}

/**
 * Splits selector nodes into base and child parts for nesting purposes.
 * The base consists of tag/class/id nodes before the first pseudo-class.
 * Child parts include pseudo-classes and everything after them.
 *
 * Special case: `:root` is treated as a standalone selector, not a modifier.
 *
 * @param {import('postcss-selector-parser').Node[]} nodes - Array of selector nodes
 * @returns {{base: import('postcss-selector-parser').Node[], child: import('postcss-selector-parser').Node[] | null}} Object with base and child arrays
 *
 * @example
 * splitBaseChild([class"a", pseudo":hover"]) // Returns { base: [class"a"], child: [pseudo":hover"] }
 * splitBaseChild([pseudo":root"]) // Returns { base: [pseudo":root"], child: null }
 */
function splitBaseChild(nodes) {
	// Special case: :root is a standalone selector
	if (
		nodes.length === 1 &&
		nodes[0].type === "pseudo" &&
		nodes[0].value === ":root"
	) {
		return { base: nodes, child: null };
	}

	let splitIdx = -1;
	for (let i = 0; i < nodes.length; i++) {
		if (nodes[i].type === "pseudo") {
			splitIdx = i;
			break;
		}
	}

	if (splitIdx === -1) {
		return { base: nodes, child: null };
	}

	return {
		base: nodes.slice(0, splitIdx),
		child: nodes.slice(splitIdx),
	};
}

/**
 * Parses a CSS selector into a nesting path for SCSS transformation.
 * Uses an AST-based approach without regex to determine base selectors
 * and child modifiers (pseudo-classes, chained classes).
 *
 * @param {string} selectorStr - The CSS selector string to parse
 * @returns {{basePath: string[], childSelector: string | null}} Object with basePath array and optional child selector
 *
 * @example
 * parseSelectorPath(".a:hover") // Returns { basePath: [".a"], childSelector: "&:hover" }
 * parseSelectorPath(".a.b .c") // Returns { basePath: [".a.b"], childSelector: ".c" }
 * parseSelectorPath(".a:hover .b") // Returns { basePath: [".a"], childSelector: "&:hover .b" }
 * parseSelectorPath(":root") // Returns { basePath: [":root"], childSelector: null }
 */
function parseSelectorPath(selectorStr) {
	const parts = splitBySpace(selectorStr);

	if (parts.length === 0) {
		return { basePath: [selectorStr], childSelector: null };
	}

	if (parts.length === 1) {
		const nodes = getNodes(parts[0]);
		const { base, child } = splitBaseChild(nodes);
		const basePath = nodesToSelector(base);

		if (!basePath) {
			return { basePath: [parts[0]], childSelector: null };
		}

		if (child && child.length > 0) {
			return { basePath: [basePath], childSelector: `&${nodesToSelector(child)}` };
		}

		return { basePath: [basePath], childSelector: null };
	}

	// Multiple parts: first part is the base, rest forms the child selector
	const firstPartNodes = getNodes(parts[0]);
	const { base: firstBase, child: firstChild } = splitBaseChild(firstPartNodes);
	const baseSelector = nodesToSelector(firstBase);

	if (!baseSelector) {
		return { basePath: [selectorStr], childSelector: null };
	}

	// Build child selector: start with first part's pseudo (if any), then add rest
	const childParts = [];
	if (firstChild && firstChild.length > 0) {
		childParts.push(`&${nodesToSelector(firstChild)}`);
	} else {
		childParts.push("&");
	}

	// Add remaining parts with proper spacing
	for (let i = 1; i < parts.length; i++) {
		childParts.push(parts[i]);
	}

	const childSelector = childParts.join(" ");

	return { basePath: [baseSelector], childSelector };
}

/**
 * Sorts nodes within a rule according to SCSS conventions.
 * Order: declarations → @media at-rules → child rules
 * Recursively sorts nested rules. Also ensures all declarations have semicolons.
 *
 * @param {import('postcss').Rule} rule - The rule to sort
 * @returns {void}
 *
 * @example
 * // Before: [rule, decl, atrule, decl]
 * sortRuleNodes(rule);
 * // After: [decl, decl, atrule, rule]
 */
function sortRuleNodes(rule) {
	const decls = [];
	const atrules = [];
	const childRules = [];

	for (const node of rule.nodes) {
		if (node.type === "decl") {
			// Ensure semicolon on all declarations
			node.raws.semicolon = true;
			decls.push(node);
		} else if (node.type === "atrule" && node.name === "media") {
			atrules.push(node);
		} else if (node.type === "rule") {
			childRules.push(node);
			// Recursively sort child rules
			sortRuleNodes(node);
		} else {
			// Keep other nodes as is (comments, etc.)
			decls.push(node);
		}
	}

	rule.removeAll();

	for (const node of decls) {
		rule.append(node);
	}

	for (const node of atrules) {
		rule.append(node);
	}

	for (const node of childRules) {
		rule.append(node);
	}
}

/**
 * Creates a signature string for declarations to compare equality.
 *
 * @param {Array<{prop: string, value: string, important: boolean}>} declarations - Array of declarations
 * @returns {string} A unique signature string for the declarations
 */
function declarationsSignature(declarations) {
	return declarations
		.map((d) => `${d.prop}:${d.value}:${d.important ? "important" : ""}`)
		.join("|");
}

/**
 * Applies nesting transformation to a CSS AST.
 * Converts flat CSS rules into nested SCSS structure using postcss-selector-parser.
 * Preserves at-rules (@keyframes, @supports, @font-face) and handles @media queries.
 * Merges comma-separated selectors with identical declarations into single rules.
 *
 * @param {import('postcss').Root} root - The PostCSS Root node to transform
 * @param {{comments: boolean}} options - Transformation options
 * @param {boolean} [options.comments=true] - Whether to preserve comments in output
 * @returns {import('postcss').Root} The transformed root with nested SCSS structure
 *
 * @example
 * const result = transform(cssRoot, { comments: true });
 */
export function transform(root, options = {}) {
	const { comments = true } = options;

	if (!comments) {
		root.walkComments((comment) => comment.remove());
	}

	const newRoot = postcss.root();

	// First, preserve all at-rules that are NOT @media (@keyframes, @supports, @font-face, etc.)
	root.walkAtRules((atRule) => {
		if (atRule.parent.type === "root" && atRule.name !== "media") {
			newRoot.append(atRule.clone());
		}
	});

	// Group selectors by (basePath, declarations, mediaParams)
	// Key format: "basePath.join('|')|declSig|mediaParams|null"
	const selectorGroups = new Map();

	// Process all rules to build groups
	root.walkRules((rule) => {
		// Skip rules that are inside @keyframes, @font-face, etc.
		if (rule.parent.type === "atrule" && rule.parent.name !== "media") {
			return;
		}

		const isInMedia =
			rule.parent.type === "atrule" && rule.parent.name === "media";
		const mediaParams = isInMedia ? rule.parent.params : null;

		// Collect declarations once
		const declarations = [];
		rule.walkDecls((decl) => {
			declarations.push({
				prop: decl.prop,
				value: decl.value,
				important: decl.important,
			});
		});

		const declSig = declarationsSignature(declarations);

		// Handle comma-separated selectors
		const selectors = rule.selector.split(/,\s*/).filter((s) => s.trim());

		for (const selector of selectors) {
			const { basePath, childSelector } = parseSelectorPath(selector);

			const groupKey = `${basePath.join("|")}|${declSig}|${mediaParams || "null"}`;

			if (!selectorGroups.has(groupKey)) {
				selectorGroups.set(groupKey, {
					basePath,
					childSelectors: [],
					declarations,
					mediaParams,
				});
			}

			const group = selectorGroups.get(groupKey);
			if (childSelector) {
				group.childSelectors.push(childSelector);
			}
		}
	});

	// Now create the actual rules from groups
	for (const group of selectorGroups.values()) {
		const { basePath, childSelectors, declarations, mediaParams } = group;

		// Find or create the base rule
		const baseRule = findOrCreateRuleAtPath(newRoot, basePath);

		if (childSelectors.length === 0) {
			// No child selector, add declarations directly to base rule
			if (mediaParams) {
				let mediaRule = null;
				for (const node of baseRule.nodes) {
					if (
						node.type === "atrule" &&
						node.name === "media" &&
						node.params === mediaParams
					) {
						mediaRule = node;
						break;
					}
				}
				if (!mediaRule) {
					mediaRule = postcss.atRule({
						name: "media",
						params: mediaParams,
					});
					baseRule.append(mediaRule);
				}
				for (const decl of declarations) {
					const newDecl = postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					});
					newDecl.raws.semicolon = true;
					mediaRule.prepend(newDecl);
				}
			} else {
				for (const decl of declarations) {
					const newDecl = postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					});
					newDecl.raws.semicolon = true;
					baseRule.prepend(newDecl);
				}
			}
		} else {
			// Has child selectors - create one child rule with comma-separated selectors
			const childSelectorStr = childSelectors.join(",\n\t");

			let targetRule;
			if (mediaParams) {
				// Find or create @media rule in base
				let mediaRule = null;
				for (const node of baseRule.nodes) {
					if (
						node.type === "atrule" &&
						node.name === "media" &&
						node.params === mediaParams
					) {
						mediaRule = node;
						break;
					}
				}
				if (!mediaRule) {
					mediaRule = postcss.atRule({
						name: "media",
						params: mediaParams,
					});
					baseRule.append(mediaRule);
				}
				targetRule = mediaRule;
			} else {
				targetRule = baseRule;
			}

			// Find existing child rule with same selector
			let childRule = null;
			for (const node of targetRule.nodes) {
				if (node.type === "rule" && node.selector === childSelectorStr) {
					childRule = node;
					break;
				}
			}

			if (!childRule) {
				childRule = postcss.rule({ selector: childSelectorStr });
				targetRule.append(childRule);
			}

			// Add declarations to child rule
			for (const decl of declarations) {
				const newDecl = postcss.decl({
					prop: decl.prop,
					value: decl.value,
					important: decl.important,
				});
				newDecl.raws.semicolon = true;
				childRule.prepend(newDecl);
			}
		}
	}

	// Sort all nodes in correct order: decl -> @media -> rule
	newRoot.walkRules((rule) => {
		sortRuleNodes(rule);
	});

	// Ensure proper SCSS output format
	newRoot.raws.semicolon = true;

	return newRoot;
}

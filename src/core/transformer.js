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
 * @returns {string[]} Array of selector strings representing the nesting path
 *
 * @example
 * parseSelectorPath(".a:hover") // Returns [".a", "&:hover"]
 * parseSelectorPath(".a.b .c") // Returns [".a.b", ".c"]
 * parseSelectorPath(":root") // Returns [":root"]
 */
function parseSelectorPath(selectorStr) {
	const parts = splitBySpace(selectorStr);
	const path = [];

	for (const part of parts) {
		const nodes = getNodes(part);
		const { base, child } = splitBaseChild(nodes);

		// Add base as selector string
		const baseStr = nodesToSelector(base);
		if (baseStr) {
			path.push(baseStr);
		}

		// If there's a child part, add it with & for nesting
		if (child && child.length > 0) {
			const childStr = nodesToSelector(child);
			// Pseudo-classes already have : prefix, just prepend &
			path.push(`&${childStr}`);
		}
	}

	return path;
}

/**
 * Sorts nodes within a rule according to SCSS conventions.
 * Order: declarations → @media at-rules → child rules
 * Recursively sorts nested rules.
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
 * Applies nesting transformation to a CSS AST.
 * Converts flat CSS rules into nested SCSS structure using postcss-selector-parser.
 * Preserves at-rules (@keyframes, @supports, @font-face) and handles @media queries.
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

	// Process all rules
	root.walkRules((rule) => {
		// Skip rules that are inside @keyframes, @font-face, etc.
		if (rule.parent.type === "atrule" && rule.parent.name !== "media") {
			return;
		}

		const isInMedia =
			rule.parent.type === "atrule" && rule.parent.name === "media";
		const mediaParams = isInMedia ? rule.parent.params : null;
		const path = parseSelectorPath(rule.selector);

		const targetRule = findOrCreateRuleAtPath(newRoot, path);

		if (isInMedia) {
			// Create or find @media rule
			let mediaRule = null;
			for (const node of targetRule.nodes) {
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
				targetRule.append(mediaRule);
			}
			rule.walkDecls((decl) => {
				mediaRule.prepend(
					postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					}),
				);
			});
		} else {
			rule.walkDecls((decl) => {
				targetRule.prepend(
					postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					}),
				);
			});
		}
	});

	// Sort all nodes in correct order: decl -> @media -> rule
	newRoot.walkRules((rule) => {
		sortRuleNodes(rule);
	});

	return newRoot;
}

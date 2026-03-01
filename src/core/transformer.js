import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Find or create a rule at a given path.
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
 * Get all nodes from a selector as an array.
 */
function getNodes(selectorStr) {
	const nodes = [];
	selectorParser((selectors) => {
		selectors.at(0).each((node) => nodes.push(node));
	}).processSync(selectorStr);
	return nodes;
}

/**
 * Convert nodes array back to selector string.
 */
function nodesToSelector(nodes) {
	return nodes.map((n) => n.toString()).join("");
}

/**
 * Split a selector by space combinators using parser API.
 */
function splitBySpace(selectorStr) {
	const parts = [];
	selectorParser((selectors) => {
		const sel = selectors.at(0);
		if (!sel) return;

		const groups = sel.split(
			(node) => node.type === "combinator" && node.value === " "
		);

		parts.push(...groups.map((g) => g.map((n) => n.toString()).join("").trim()));
	}).processSync(selectorStr);

	return parts;
}

/**
 * Split nodes into base and child parts.
 * Base: tag/class/id nodes before first pseudo
 * Child: pseudo nodes and everything after
 */
function splitBaseChild(nodes) {
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
 * Parse selector into nesting path.
 * Uses AST-based approach without regex.
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
 * Sort rule nodes: decl -> atrule (@media) -> rule
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
 * Apply nesting transformation to CSS AST.
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

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
 * Parse a selector into parts by space combinators only.
 */
function splitBySpace(selectorStr) {
	const parts = [];

	selectorParser((selectors) => {
		const selector = selectors.at(0);
		if (!selector) return;

		let current = "";

		// Use each() instead of walk() to avoid recursing into nested nodes
	// (e.g., the argument of :nth-child(2) which would cause duplication)
	selector.each((node) => {
		if (node.type === "combinator" && node.value === " ") {
			if (current) {
				parts.push(current);
				current = "";
			}
		} else {
			current += node.toString();
		}
	});

		if (current) {
			parts.push(current);
		}
	}).processSync(selectorStr);

	return parts;
}

/**
 * Check if a selector is "simple" (single class, id, or tag).
 */
function isSimpleSelector(selector) {
	let nodeCount = 0;
	let hasMultipleClasses = false;

	selectorParser((selectors) => {
		const selector = selectors.at(0);
		if (!selector) return;

		selector.walk((node) => {
			if (node.type === "class" || node.type === "id" || node.type === "tag") {
				nodeCount++;
				if (node.type === "class" && nodeCount > 1) {
					hasMultipleClasses = true;
				}
			}
		});
	}).processSync(selector);

	return !hasMultipleClasses;
}

/**
 * Extract base without pseudo-classes
 */
function extractBaseWithoutPseudo(selector) {
	// Find first combinator (>, +, ~) or pseudo-class (:)
	for (let i = 0; i < selector.length; i++) {
		const char = selector[i];
		if (char === ":" || char === ">" || char === "+" || char === "~") {
			return selector.slice(0, i);
		}
	}
	return selector;
}

/**
 * Find the longest base selector that matches the start of a selector.
 * Stops at combinators (> + ~) or pseudo-classes (:).
 */
function findBaseMatch(selector, knownBases) {
	const sortedBases = [...knownBases].sort((a, b) => b.length - a.length);

	for (const base of sortedBases) {
		if (selector === base) {
			return { base, remainder: "" };
		}
		if (selector.startsWith(base)) {
			const remainder = selector.slice(base.length);
			// Only chain if remainder starts with ., #, or : (but not :> or :+ etc.)
			if (
				remainder &&
				(remainder[0] === "." ||
					remainder[0] === "#" ||
					(remainder[0] === ":" && !remainder.startsWith(":>")))
			) {
				return { base, remainder };
			}
		}
	}

	return null;
}

/**
 * Parse selector into nesting path.
 * Handles chained classes, pseudo-classes, and combinators.
 */
function parseSelectorPath(selectorStr, knownBases) {
	const parts = splitBySpace(selectorStr);
	const path = [];

	for (const part of parts) {
		const match = findBaseMatch(part, knownBases);
		if (match && match.remainder) {
			path.push(match.base);
			// Split remainder at combinators (> + ~)
			const remainder = match.remainder;
			// Updated regex to handle tags after combinators and pseudo-classes
			const combinatorMatch = remainder.match(/^([.#][\w-]*)?([>+~])?\s*(.*)?$/);
			if (combinatorMatch) {
				const [, chain, combinator, after] = combinatorMatch;
				if (chain) {
					path.push(`&${chain}`);
				}
				if (combinator) {
					path.push(combinator);
				}
				if (after) {
					// If after starts with :, ., or #, prepend & for proper nesting
					if (after.startsWith(":") || after.startsWith(".") || after.startsWith("#")) {
						path.push(`&${after}`);
					} else {
						path.push(after);
					}
				}
			} else {
				path.push(`&${remainder}`);
			}
		} else {
			path.push(part);
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
	const knownBases = new Set();

	// Collect base selectors (without pseudo-classes or combinators)
	root.walkRules((rule) => {
		const parts = splitBySpace(rule.selector);
		if (parts.length > 0) {
			const base = extractBaseWithoutPseudo(parts[0]);
			if (isSimpleSelector(base)) {
				knownBases.add(base);
			}
		}
	});

	// First, preserve all at-rules that are NOT @media (@keyframes, @supports, @font-face, etc.)
	root.walkAtRules((atRule) => {
		if (atRule.parent.type === "root" && atRule.name !== "media") {
			newRoot.append(atRule.clone());
		}
	});

	// Process all rules
	root.walkRules((rule) => {
		// Skip rules that are inside @keyframes, @font-face, etc.
		// We want to preserve those at-rules as-is with their contents
		if (rule.parent.type === "atrule" && rule.parent.name !== "media") {
			return;
		}

		const isInMedia =
			rule.parent.type === "atrule" && rule.parent.name === "media";
		const mediaParams = isInMedia ? rule.parent.params : null;
		const path = parseSelectorPath(rule.selector, knownBases);

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
			// Prepend declarations so they appear before child rules
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
			// Prepend declarations so they appear before child rules
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

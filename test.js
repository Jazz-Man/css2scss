import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Finds or creates a nested rule at the given path.
 * Only searches direct children, not all descendants.
 */
function findOrCreateNestedRule(parent, path) {
	if (path.length === 0) {
		return parent;
	}

	const selector = path[0];
	let existingChild = null;

	// Only check direct children (nodes), not walkRules which goes deep
	for (const node of parent.nodes) {
		if (node.type === "rule" && node.selector === selector) {
			existingChild = node;
			break;
		}
	}

	if (existingChild) {
		return findOrCreateNestedRule(existingChild, path.slice(1));
	}

	const newRule = postcss.rule({ selector });
	parent.append(newRule);

	if (path.length === 1) {
		return newRule;
	}

	return findOrCreateNestedRule(newRule, path.slice(1));
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

		selector.walk((node) => {
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
 * Find the longest base selector that matches the start of a selector.
 */
function findBaseMatch(selector, knownBases) {
	const sortedBases = [...knownBases].sort((a, b) => b.length - a.length);

	for (const base of sortedBases) {
		if (selector === base) {
			return { base, remainder: "" };
		}
		if (selector.startsWith(base)) {
			const remainder = selector.slice(base.length);
			// Check for chained class (.b), id (#b), or pseudo-class (:hover, :first-child, etc.)
			if (remainder && (remainder[0] === "." || remainder[0] === "#" || remainder[0] === ":")) {
				return { base, remainder };
			}
		}
	}

	return null;
}

/**
 * Process rules outside of @media/@supports/etc.
 */
function processNormalRules(root, newRoot, parentMap, knownBases) {
	root.walkRules((rule) => {
		// Skip rules inside @media, @supports, etc.
		if (rule.parent.type === "atrule") {
			return;
		}

		const parts = splitBySpace(rule.selector);
		if (parts.length === 0) {
			newRoot.append(rule.clone());
			return;
		}

		const firstPart = parts[0];
		const baseMatch = findBaseMatch(firstPart, knownBases);

		if (baseMatch && baseMatch.remainder) {
			const { base, remainder } = baseMatch;
			const chainedSelector = "&" + remainder;

			let parentRule;
			if (!parentMap.has(base)) {
				parentRule = postcss.rule({ selector: base });
				parentMap.set(base, parentRule);
				newRoot.append(parentRule);
			} else {
				parentRule = parentMap.get(base);
			}

			const path = [chainedSelector, ...parts.slice(1)];
			const targetRule = findOrCreateNestedRule(parentRule, path);

			rule.walkDecls((decl) => {
				targetRule.append(
					postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					}),
				);
			});
		} else if (parts.length === 1) {
			const selector = parts[0];
			let targetRule;
			if (!parentMap.has(selector)) {
				targetRule = postcss.rule({ selector });
				parentMap.set(selector, targetRule);
				newRoot.append(targetRule);
			} else {
				targetRule = parentMap.get(selector);
			}
			rule.walkDecls((decl) => {
				targetRule.append(
					postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					}),
				);
			});
		} else {
			const path = [];

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const chainMatch = findBaseMatch(part, knownBases);

				if (chainMatch && chainMatch.remainder && i > 0) {
					path.push(chainMatch.base);
					path.push("&" + chainMatch.remainder);
				} else {
					path.push(part);
				}
			}

			const base = path[0];
			const children = path.slice(1);

			let parentRule;
			if (!parentMap.has(base)) {
				parentRule = postcss.rule({ selector: base });
				parentMap.set(base, parentRule);
				newRoot.append(parentRule);
			} else {
				parentRule = parentMap.get(base);
			}

			const targetRule = findOrCreateNestedRule(parentRule, children);
			rule.walkDecls((decl) => {
				targetRule.append(
					postcss.decl({
						prop: decl.prop,
						value: decl.value,
						important: decl.important,
					}),
				);
			});
		}
	});
}

/**
 * Converts flat CSS rules to nested SCSS structure.
 */
function applyNesting(root) {
	const newRoot = postcss.root();
	const parentMap = new Map();

	// Collect base selectors (excluding @media rules)
	// For selectors like .a:hover, we add .a to knownBases
	const knownBases = new Set();
	root.walkRules((rule) => {
		// Skip rules inside @media, @supports, etc.
		if (rule.parent.type === "atrule") {
			return;
		}
		const parts = splitBySpace(rule.selector);
		if (parts.length > 0) {
			const first = parts[0];
			// Extract base without pseudo-classes (:hover, :first-child, etc.)
			const pseudoIndex = first.indexOf(":");
			const base = pseudoIndex > 0 ? first.slice(0, pseudoIndex) : first;
			if (isSimpleSelector(base)) {
				knownBases.add(base);
			}
		}
	});

	// Process normal rules (outside @media)
	processNormalRules(root, newRoot, parentMap, knownBases);

	// Process @media, @supports, etc. - apply nesting inside them
	root.walkAtRules((atRule) => {
		if (
			atRule.name === "media" ||
			atRule.name === "supports" ||
			atRule.name === "container"
		) {
			// Create new atrule and process its rules with nesting
			const newAtRule = postcss.atRule({
				name: atRule.name,
				params: atRule.params,
			});

			const mediaParentMap = new Map();

			atRule.walkRules((rule) => {
				const parts = splitBySpace(rule.selector);
				if (parts.length === 0) {
					newAtRule.append(rule.clone());
					return;
				}

				const firstPart = parts[0];
				const baseMatch = findBaseMatch(firstPart, knownBases);

				if (baseMatch && baseMatch.remainder) {
					const { base, remainder } = baseMatch;
					const chainedSelector = "&" + remainder;

					let parentRule;
					if (!mediaParentMap.has(base)) {
						parentRule = postcss.rule({ selector: base });
						mediaParentMap.set(base, parentRule);
						newAtRule.append(parentRule);
					} else {
						parentRule = mediaParentMap.get(base);
					}

					const path = [chainedSelector, ...parts.slice(1)];
					const targetRule = findOrCreateNestedRule(parentRule, path);

					rule.walkDecls((decl) => {
						targetRule.append(
							postcss.decl({
								prop: decl.prop,
								value: decl.value,
								important: decl.important,
							}),
						);
					});
				} else if (parts.length === 1) {
					const selector = parts[0];
					let targetRule;
					if (!mediaParentMap.has(selector)) {
						targetRule = postcss.rule({ selector });
						mediaParentMap.set(selector, targetRule);
						newAtRule.append(targetRule);
					} else {
						targetRule = mediaParentMap.get(selector);
					}
					rule.walkDecls((decl) => {
						targetRule.append(
							postcss.decl({
								prop: decl.prop,
								value: decl.value,
								important: decl.important,
							}),
						);
					});
				} else {
					const path = [];

					for (let i = 0; i < parts.length; i++) {
						const part = parts[i];
						const chainMatch = findBaseMatch(part, knownBases);

						if (chainMatch && chainMatch.remainder && i > 0) {
							path.push(chainMatch.base);
							path.push("&" + chainMatch.remainder);
						} else {
							path.push(part);
						}
					}

					const base = path[0];
					const children = path.slice(1);

					let parentRule;
					if (!mediaParentMap.has(base)) {
						parentRule = postcss.rule({ selector: base });
						mediaParentMap.set(base, parentRule);
						newAtRule.append(parentRule);
					} else {
						parentRule = mediaParentMap.get(base);
					}

					const targetRule = findOrCreateNestedRule(parentRule, children);
					rule.walkDecls((decl) => {
						targetRule.append(
							postcss.decl({
								prop: decl.prop,
								value: decl.value,
								important: decl.important,
							}),
						);
					});
				}
			});

			newRoot.append(newAtRule);
		} else {
			// Other atrules - keep as is
			newRoot.append(atRule.clone());
		}
	});

	// Preserve comments
	root.walkComments((comment) => {
		newRoot.append(comment.clone());
	});

	return newRoot;
}

// Test
const inputCSS = `
.SocialPost_socialNewsPost {
    width: 100%;
    margin-top: 16px;
    border-bottom: 1px solid var(--e10Color);
    padding-bottom: 16px;
    cursor: default;
}
.light-mode .SocialPost_socialNewsPost {
    border-bottom: 1px solid var(--e5Color);
}
.SocialPost_socialNewsPost:first-child {
    margin-top: 0;
}
@media only screen and (max-width: 575.98px) {
    .SocialPost_socialNewsPost {
        max-width: 272px;
    }
}
.SocialPost_socialNewsPost .SocialPost_heading {
    display: flex;
    align-items: center;
}
.SocialPost_socialNewsPost .SocialPost_heading img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
}
.SocialPost_socialNewsPost .SocialPost_heading .SocialPost_name {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    word-break: break-all;
    white-space: normal;
    margin-left: 10px;
    font-weight: 700;
    color: var(--e70Color);
}
.SocialPost_socialNewsPost .SocialPost_heading .SocialPost_time {
    display: flex;
    align-items: normal;
    font-weight: 500;
    color: var(--e50Color);
    width: 100%;
    max-width: max-content;
}
.SocialPost_socialNewsPost .SocialPost_heading .SocialPost_time span {
    margin: 0 8px;
    color: var(--e30Color);
}
.light-mode
    .SocialPost_socialNewsPost
    .SocialPost_heading
    .SocialPost_time
    span {
    color: var(--e20Color);
}
.SocialPost_socialNewsPost .SocialPost_heading .SocialPost_icon {
    margin-left: auto;
    font-size: 24px;
    color: var(--WhiteColor);
}
.light-mode
    .SocialPost_socialNewsPost
    .SocialPost_heading
    .SocialPost_icon.SocialPost_iconTwitter {
    color: var(--twitterColor);
}
.light-mode
    .SocialPost_socialNewsPost
    .SocialPost_heading
    .SocialPost_icon.SocialPost_iconSocial {
    color: var(--redditColor);
}
.SocialPost_socialNewsPost .SocialPost_description {
    display: -webkit-box;
    max-height: 76px;
    overflow: hidden;
    margin-top: 8px;
    font-weight: 400;
    color: var(--e80Color);
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    width: calc(100% - 20px);
}
.SocialPost_socialNewsPost .SocialPost_description:hover {
    text-decoration: underline;
}
.SocialPost_socialNewsPost .SocialPost_bullishBearishParent {
    margin-top: 11px;
}
.SocialPost_socialNewsPost
    .SocialPost_bullishBearishParent
    .SocialPost_contentSection
    .SocialPost_share
    .SocialPost_iconShare {
    font-size: 24px;
}
@media only screen and (max-width: 575.98px) {
    .SocialPost_socialNewsPost
        .SocialPost_bullishBearishParent
        .SocialPost_contentSection {
        display: flex;
        flex-wrap: wrap;
    }
    .SocialPost_socialNewsPost
        .SocialPost_bullishBearishParent
        .SocialPost_contentSection
        .SocialPost_bearish {
        margin: unset;
    }
}
`;

const root = postcss.parse(inputCSS);
const newRoot = applyNesting(root);

console.log(newRoot.toString());

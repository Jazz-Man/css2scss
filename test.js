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
 * Extract base without pseudo-classes
 */
function extractBaseWithoutPseudo(selector) {
	const pseudoIndex = selector.indexOf(":");
	return pseudoIndex > 0 ? selector.slice(0, pseudoIndex) : selector;
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
			if (remainder && (remainder[0] === "." || remainder[0] === "#" || remainder[0] === ":")) {
				return { base, remainder };
			}
		}
	}

	return null;
}

/**
 * Parse selector into nesting path.
 */
function parseSelectorPath(selectorStr, knownBases) {
	const parts = splitBySpace(selectorStr);
	const path = [];

	for (const part of parts) {
		const match = findBaseMatch(part, knownBases);
		if (match && match.remainder) {
			path.push(match.base);
			path.push("&" + match.remainder);
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
			// Keep other nodes as is
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
 * Converts flat CSS to nested SCSS with @media rules nested inside classes.
 */
function applyNesting(root) {
	const newRoot = postcss.root();
	const knownBases = new Set();

	// Collect base selectors
	root.walkRules((rule) => {
		const parts = splitBySpace(rule.selector);
		if (parts.length > 0) {
			const base = extractBaseWithoutPseudo(parts[0]);
			if (isSimpleSelector(base)) {
				knownBases.add(base);
			}
		}
	});

	// Process all rules
	root.walkRules((rule) => {
		const isInMedia = rule.parent.type === "atrule" && rule.parent.name === "media";
		const mediaParams = isInMedia ? rule.parent.params : null;

		const path = parseSelectorPath(rule.selector, knownBases);
		const targetRule = findOrCreateRuleAtPath(newRoot, path);

		if (isInMedia) {
			// Create or find @media rule
			let mediaRule = null;
			for (const node of targetRule.nodes) {
				if (node.type === "atrule" && node.name === "media" && node.params === mediaParams) {
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
				mediaRule.append(postcss.decl({
					prop: decl.prop,
					value: decl.value,
					important: decl.important,
				}));
			});
		} else {
			rule.walkDecls((decl) => {
				targetRule.append(postcss.decl({
					prop: decl.prop,
					value: decl.value,
					important: decl.important,
				}));
			});
		}
	});

	// Sort all nodes in correct order
	newRoot.walkRules((rule) => {
		sortRuleNodes(rule);
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

/**
 * Shared test utilities for POC tests.
 *
 * Provides common helpers, fixtures, and custom matchers
 * to reduce boilerplate across test files.
 */

import postcss from "postcss";
import scss from "postcss-scss";

/**
 * Convert PostCSS Root to SCSS string
 * @param {import('postcss').Root} root - PostCSS Root node
 * @returns {string} SCSS string
 */
export function toSCSS(root) {
	return root.toString(scss.syntax);
}

/**
 * Create a PostCSS declaration
 * @param {string} prop - Property name
 * @param {string} value - Property value
 * @returns {import('postcss').Declaration} PostCSS declaration
 */
export function decl(prop, value) {
	return postcss.decl({ prop, value });
}

/**
 * Create a color declaration (most common case)
 * @param {string} color - Color value (e.g., "red", "#fff")
 * @returns {import('postcss').Declaration} PostCSS declaration
 */
export function colorDecl(color = "red") {
	return decl("color", color);
}

/**
 * Create a display declaration
 * @param {string} value - Display value (e.g., "block", "flex")
 * @returns {import('postcss').Declaration} PostCSS declaration
 */
export function displayDecl(value = "block") {
	return decl("display", value);
}

/**
 * Create a margin declaration
 * @param {string} value - Margin value (e.g., "0", "10px")
 * @returns {import('postcss').Declaration} PostCSS declaration
 */
export function marginDecl(value = "0") {
	return decl("margin", value);
}

/**
 * Transform selector and return SCSS string
 * @param {string} selector - CSS selector string
 * @param {import('postcss').Declaration} declaration - Declaration to add
 * @param {Function} transformFn - Transform function to use
 * @returns {string} SCSS string
 */
export function transformToSCSS(selector, declaration, transformFn) {
	const result = transformFn(selector, { declaration });
	return toSCSS(result);
}

/**
 * Assert that SCSS contains nested selector structure
 * @param {string} scss - SCSS string to check
 * @param {string[]} selectors - Selectors that should be present in order
 */
export function assertNestingStructure(scss, ...selectors) {
	let currentIndex = 0;
	for (const selector of selectors) {
		const found = scss.indexOf(selector, currentIndex);
		if (found === -1) {
			throw new Error(
				`Expected "${selector}" not found in SCSS. Looking for structure: ${selectors.join(" → ")}`,
			);
		}
		currentIndex = found + selector.length;
	}
}

/**
 * Selector test cases for common patterns
 */
export const selectorFixtures = {
	// Simple selectors
	simpleClasses: [".a", ".b", ".c"],
	chainedClasses: [".a.b", ".x.y", ".foo.bar"],

	// Pseudo-classes
	pseudoClasses: [
		".btn:hover",
		".btn:focus",
		".btn:active",
		".btn:hover:focus",
	],

	// Pseudo-elements
	pseudoElements: [".icon::before", ".icon::after", ".a.b::before"],

	// Combinators
	childCombinators: [".parent > .child", ".nav > .item"],
	adjacentSibling: [".header + .content", ".h1 + .p"],
	generalSibling: [".section ~ .footer"],

	// Attributes
	attributes: [
		"[type='text']",
		'[data-foo="bar"]',
		'[href^="https://"]',
		'[class*="icon-"]',
	],

	// :not() pseudo
	notSelectors: [":not(.excluded)", ":not([disabled])", ":not(.a, .b)"],

	// Complex nesting
	deepNesting: [".a .b .c .d .e", ".one .two .three .four:hover"],

	// Real-world patterns
	bem: [".block", ".block__element", ".block--modifier"],
	utility: [".flex", ".items-center", ".justify-between"],
	state: [".btn:hover", ".btn:focus", ".btn:active"],
};

/**
 * Parameterized test case builder
 * @param {string} description - Test description
 * @param {Array<Array>} cases - Array of [input, ...expectations]
 * @param {Function} testFn - Test function receiving (input, ...expectations)
 * @returns {Function} Test function configured with cases
 */
export function cases(description, cases, testFn) {
	return function runCases(testOrDescribe) {
		const method = testOrDescribe.each || testOrDescribe;
		return method(cases)(description, testFn);
	};
}

/**
 * Build test cases for selector transformation
 * @param {Array<{selector: string, expectations: string[]}>} scenarios
 * @returns {Array} Array of test cases for test.each()
 */
export function buildSelectorCases(scenarios) {
	return scenarios.map(({ selector, expectations }) => [
		selector,
		...expectations,
	]);
}

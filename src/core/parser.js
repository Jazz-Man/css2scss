import postcss from "postcss";

/**
 * Parses a CSS string into a PostCSS root node.
 *
 * @param {string} cssString - The CSS string to parse.
 * @returns {import('postcss').Root} The PostCSS root node representing the parsed CSS.
 */
export function parseCSS(cssString) {
	try {
		const root = postcss.parse(cssString, {
			from: undefined,
		});
		return root;
	} catch (error) {
		throw new Error(`CSS parsing error: ${error.message}`);
	}
}

import postcss from "postcss";

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

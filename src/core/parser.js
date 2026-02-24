import postcss from "postcss";

export function parseCSS(cssString) {
	try {
		const root = postcss.parse(cssString, {
			from: undefined,
			syntax: undefined,
		});
		return root;
	} catch (error) {
		throw new Error(`CSS parsing error: ${error.message}`);
	}
}

export function validateCSS(cssString) {
	try {
		parseCSS(cssString);
		return true;
	} catch {
		return false;
	}
}

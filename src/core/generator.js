/**
 *
 * @param {import('postcss').Root} root
 * @param {*} options
 * @returns
 */
export function generateSCSS(root, options = {}) {
	let result = "";

	root.each((node) => {
		const nodeStr = nodeToString(node, 0);
		if (nodeStr) {
			result += `${nodeStr}\n`;
		}
	});

	return result.trim();
}

/**
 * Converts a PostCSS node to a string representation.
 *
 * @param {import('postcss').Node} node - The PostCSS node to convert.
 * @param {number} depth - The depth of the node in the tree.
 * @returns {string} The string representation of the node.
 */
function nodeToString(node, depth) {
	const indent = "  ".repeat(depth);

	if (node.type === "decl") {
		const important = node.important ? " !important" : "";
		return `${indent}${node.prop}: ${node.value}${important};`;
	}

	if (node.type === "rule") {
		let result = `${indent}${node.selector} {\n`;

		node.each((child) => {
			const childStr = nodeToString(child, depth + 1);
			if (childStr) {
				result += `${childStr}\n`;
			}
		});

		result += `${indent}}`;
		return result;
	}

	if (node.type === "atrule") {
		let result = `${indent}@${node.name}`;

		if (node.params) {
			result += ` ${node.params}`;
		}

		if (node.nodes && node.nodes.length > 0) {
			result += " {\n";

			node.each((child) => {
				const childStr = nodeToString(child, depth + 1);
				if (childStr) {
					result += `${childStr}\n`;
				}
			});

			result += `${indent}}`;
		} else {
			result += ";";
		}

		return result;
	}

	if (node.type === "comment") {
		return `${indent}/* ${node.text} */`;
	}

	return "";
}

import postcss from "postcss";
import scssSyntax from "postcss-scss";

export function generateSCSS(root, options = {}) {
	const { indent = "space", indentSize = 2 } = options;

	const indentChar = indent === "tab" ? "\t" : " ";
	const indentString = indentChar.repeat(indentSize);

	root.walkComments((comment) => {
		comment.raws.left = " ";
		comment.raws.right = " ";
	});

	let result = "";

	root.each((node) => {
		result += nodeToString(node, indentString, 0) + "\n";
	});

	return result.trim();
}

function nodeToString(node, indent, depth) {
	const currentIndent = indent.repeat(depth);

	if (node.type === "decl") {
		const isVariable = node.prop.startsWith("$");
		return `${currentIndent}${node.prop}: ${node.value};`;
	}

	if (node.type === "rule") {
		let result = `${currentIndent}${node.selector} {\n`;

		node.each((child) => {
			result += nodeToString(child, indent, depth + 1) + "\n";
		});

		result += `${currentIndent}}`;
		return result;
	}

	if (node.type === "atrule") {
		let result = `${currentIndent}@${node.name}`;

		if (node.params) {
			result += ` ${node.params}`;
		}

		if (node.nodes && node.nodes.length > 0) {
			result += " {\n";

			node.each((child) => {
				result += `${nodeToString(child, indent, depth + 1)}\n`;
			});

			result += `${currentIndent}}`;
		} else {
			result += ";";
		}

		return result;
	}

	if (node.type === "comment") {
		return `${currentIndent}/* ${node.text} */`;
	}

	return "";
}

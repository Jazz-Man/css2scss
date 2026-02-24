export function generateSCSS(root, options = {}) {
	const { indent = "space", indentSize = 2 } = options;

	const indentChar = indent === "tab" ? "\t" : " ";
	const indentString = indentChar.repeat(indentSize);

	// PostCSS вже має вбудований генератор, використовуємо його
	const result = root.toResult({
		syntax: {
			stringify: (node, builder) => {
				stringifyNode(node, builder, indentString, 0);
			},
		},
	});

	return result.css;
}

function stringifyNode(node, builder, indent, depth) {
	const currentIndent = indent.repeat(depth);

	if (node.type === "root") {
		node.each((child) => {
			stringifyNode(child, builder, indent, depth);
		});
	}

	if (node.type === "rule") {
		builder(`${currentIndent}${node.selector} {\n`);
		node.each((child) => {
			stringifyNode(child, builder, indent, depth + 1);
		});
		builder(`${currentIndent}}`);
	}

	if (node.type === "decl") {
		builder(`${currentIndent}${node.prop}: ${node.value};\n`);
	}

	if (node.type === "atrule") {
		builder(`${currentIndent}@${node.name} ${node.params} {\n`);
		node.each((child) => {
			stringifyNode(child, builder, indent, depth + 1);
		});
		builder(`${currentIndent}}`);
	}
}

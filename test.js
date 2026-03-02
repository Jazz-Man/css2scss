import postcss from "postcss";

import { transformSelectorReduce } from "./src/poc/reduce-transformer.js";

const declarations = [
	postcss.decl({ prop: "width", value: "100%" }),
	postcss.decl({ prop: "height", value: "auto" }),
	postcss.decl({ prop: "display", value: "block" }),
];

const result = transformSelectorReduce(".c, .d:hover", {
	declarations,
});

console.log(result.toString());

import postcss from "postcss";
import scss from "postcss-scss";
import selectorParser from "postcss-selector-parser";

/** @type {import('postcss').Root} */
const newRoot = postcss.root();

const rootRule = postcss
	.rule({ selector: ".some-root-class" })
	.append(postcss.decl({ prop: "width", value: "100%" }));

const innerRule = postcss
	.rule({ selector: ".inner-selector" })
	.append(postcss.decl({ prop: "max-width", value: "1320px" }));

rootRule.append(innerRule);

newRoot.append(rootRule);

console.log(newRoot.toString());

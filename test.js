import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

import { transformSelectorReduce } from "./src/poc/reduce-transformer.js";

import debug from "./src/utils/debug";

const result = transformSelectorReduce(".test, .item:hover, .link.active");

console.log(result.toString());
// console.log(newRoot.toString());

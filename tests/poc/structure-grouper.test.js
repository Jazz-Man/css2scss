import { describe, expect, test } from "bun:test";

import postcss from "postcss";
import {
	buildStructureGroup,
	buildStructureKey,
	canGroupTogether,
	groupByStructure,
} from "../../src/poc/structure-grouper.js";

describe("structure-grouper", () => {
	describe("buildStructureKey", () => {
		test("should build key for empty nodes", () => {
			expect(buildStructureKey([])).toBe("empty");
		});

		test("should build key for single class", () => {
			const nodes = [{ type: "class", value: ".test" }];
			expect(buildStructureKey(nodes)).toBe("class");
		});

		test("should build key for chained classes", () => {
			const nodes = [
				{ type: "class", value: ".a" },
				{ type: "class", value: ".b" },
			];
			expect(buildStructureKey(nodes)).toBe("class|class");
		});

		test("should build key for pseudo-class", () => {
			const nodes = [
				{ type: "class", value: ".a" },
				{ type: "pseudo", value: ":hover" },
			];
			expect(buildStructureKey(nodes)).toBe("class|pseudo");
		});

		test("should build key for descendant", () => {
			const nodes = [
				{ type: "class", value: ".a" },
				{ type: "combinator", value: " " },
				{ type: "class", value: ".b" },
			];
			expect(buildStructureKey(nodes)).toBe("class|combinator|class");
		});

		test("should build key for child combinator", () => {
			const nodes = [
				{ type: "class", value: ".a" },
				{ type: "combinator", value: ">" },
				{ type: "class", value: ".b" },
			];
			expect(buildStructureKey(nodes)).toBe("class|combinator|class");
		});
	});

	describe("canGroupTogether", () => {
		test("should return true for single selector", () => {
			const selectors = [{ nodes: [{ type: "class", value: ".a" }] }];
			expect(canGroupTogether(selectors)).toBe(true);
		});

		test("should return true for selectors with same structure", () => {
			const selectors = [
				{
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
				},
				{
					nodes: [
						{ type: "class", value: ".b" },
						{ type: "pseudo", value: ":focus" },
					],
				},
			];
			expect(canGroupTogether(selectors)).toBe(true);
		});

		test("should return false for selectors with different structure", () => {
			const selectors = [
				{
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
				},
				{ nodes: [{ type: "class", value: ".b" }] },
			];
			expect(canGroupTogether(selectors)).toBe(false);
		});

		test("should return true for selectors with same combinator type (structure only, not value)", () => {
			const selectors = [
				{
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: " " },
						{ type: "class", value: ".b" },
					],
				},
				{
					nodes: [
						{ type: "class", value: ".c" },
						{ type: "combinator", value: ">" },
						{ type: "class", value: ".d" },
					],
				},
			];
			// Structure key is "class|combinator|class" for both - the VALUE of the combinator doesn't matter
			expect(canGroupTogether(selectors)).toBe(true);
		});

		test("should return false for selectors with different structure types", () => {
			const selectors = [
				{
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: " " },
						{ type: "class", value: ".b" },
					],
				},
				{
					nodes: [
						{ type: "class", value: ".c" },
						{ type: "class", value: ".d" },
					],
				},
			];
			// Different structure: one has combinator, one doesn't
			expect(canGroupTogether(selectors)).toBe(false);
		});
	});

	describe("groupByStructure", () => {
		test("should group selectors by structure", () => {
			const selectors = [
				{
					selector: ".a:hover",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
				},
				{
					selector: ".b:focus",
					nodes: [
						{ type: "class", value: ".b" },
						{ type: "pseudo", value: ":focus" },
					],
				},
				{ selector: ".c", nodes: [{ type: "class", value: ".c" }] },
			];

			const groups = groupByStructure(selectors);

			expect(groups.size).toBe(2);
			expect(groups.has("class|pseudo")).toBe(true);
			expect(groups.has("class")).toBe(true);
			expect(groups.get("class|pseudo")).toHaveLength(2);
			expect(groups.get("class")).toHaveLength(1);
		});

		test("should handle empty selector array", () => {
			const groups = groupByStructure([]);
			expect(groups.size).toBe(0);
		});
	});

	describe("buildStructureGroup", () => {
		test("should build nested rules for structure group", () => {
			const group = [
				{
					selector: ".a:hover",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
				},
				{
					selector: ".b:focus",
					nodes: [
						{ type: "class", value: ".b" },
						{ type: "pseudo", value: ":focus" },
					],
				},
			];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const result = buildStructureGroup(group, declarations, root);

			expect(result).toBe(true);
			const output = root.toString();
			expect(output).toContain(".a, .b");
			expect(output).toContain("&:hover, &:focus");
			expect(output).toContain("color: red");
		});

		test("should return false for group with child combinator", () => {
			const group = [
				{
					selector: ".a > .b",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: ">" },
						{ type: "class", value: ".b" },
					],
				},
				{
					selector: ".c > .d",
					nodes: [
						{ type: "class", value: ".c" },
						{ type: "combinator", value: ">" },
						{ type: "class", value: ".d" },
					],
				},
			];
			const declarations = [postcss.decl({ prop: "color", value: "blue" })];
			const root = postcss.root();

			const result = buildStructureGroup(group, declarations, root);

			expect(result).toBe(false);
			// Should not have added any rules
			expect(root.nodes).toHaveLength(0);
		});

		test("should return false for group with adjacent sibling combinator", () => {
			const group = [
				{
					selector: ".a + .b",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: "+" },
						{ type: "class", value: ".b" },
					],
				},
				{
					selector: ".c + .d",
					nodes: [
						{ type: "class", value: ".c" },
						{ type: "combinator", value: "+" },
						{ type: "class", value: ".d" },
					],
				},
			];
			const declarations = [postcss.decl({ prop: "color", value: "green" })];
			const root = postcss.root();

			const result = buildStructureGroup(group, declarations, root);

			expect(result).toBe(false);
		});

		test("should handle group with descendant (space combinator)", () => {
			const group = [
				{
					selector: ".a .b",
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "combinator", value: " " },
						{ type: "class", value: ".b" },
					],
				},
				{
					selector: ".c .d",
					nodes: [
						{ type: "class", value: ".c" },
						{ type: "combinator", value: " " },
						{ type: "class", value: ".d" },
					],
				},
			];
			const declarations = [postcss.decl({ prop: "width", value: "100%" })];
			const root = postcss.root();

			const result = buildStructureGroup(group, declarations, root);

			expect(result).toBe(true);
			const output = root.toString();
			expect(output).toContain(".a, .c");
			expect(output).toContain(".b, .d");
			expect(output).toContain("width: 100%");
		});

		test("should return false for empty group", () => {
			const group = [];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const result = buildStructureGroup(group, declarations, root);

			expect(result).toBe(false);
		});
	});
});

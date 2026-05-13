/**
 * Structure grouper tests using parameterized testing patterns.
 *
 * Tests the structure-based selector grouping logic.
 */

import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import {
	buildStructureGroup,
	buildStructureKey,
	canGroupTogether,
	groupByStructure,
} from "../../src/core/structure-grouper.js";

describe("structure-grouper", () => {
	describe("buildStructureKey", () => {
		test.each([
			{ description: "empty nodes", expected: "empty", nodes: [] },
			{
				description: "single class",
				expected: "class",
				nodes: [{ type: "class", value: ".test" }],
			},
			{
				description: "chained classes",
				expected: "class|class",
				nodes: [
					{ type: "class", value: ".a" },
					{ type: "class", value: ".b" },
				],
			},
			{
				description: "pseudo-class",
				expected: "class|pseudo",
				nodes: [
					{ type: "class", value: ".a" },
					{ type: "pseudo", value: ":hover" },
				],
			},
			{
				description: "descendant",
				expected: "class|combinator|class",
				nodes: [
					{ type: "class", value: ".a" },
					{ type: "combinator", value: " " },
					{ type: "class", value: ".b" },
				],
			},
			{
				description: "child combinator",
				expected: "class|combinator|class",
				nodes: [
					{ type: "class", value: ".a" },
					{ type: "combinator", value: ">" },
					{ type: "class", value: ".b" },
				],
			},
		])("should build key for $description", ({ nodes, expected }) => {
			expect(buildStructureKey(nodes)).toBe(expected);
		});
	});

	describe("canGroupTogether", () => {
		test.each([
			{
				description: "single selector",
				expected: true,
				selectors: [{ nodes: [{ type: "class", value: ".a" }] }],
			},
			{
				description: "same structure (class|pseudo)",
				expected: true,
				selectors: [
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
				],
			},
			{
				description: "different structure",
				expected: false,
				selectors: [
					{
						nodes: [
							{ type: "class", value: ".a" },
							{ type: "pseudo", value: ":hover" },
						],
					},
					{ nodes: [{ type: "class", value: ".b" }] },
				],
			},
			{
				description: "same combinator type (different values)",
				expected: true,
				selectors: [
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
				],
			},
			{
				description: "different structure types",
				expected: false,
				selectors: [
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
				],
			},
		])("should return $expected for $description", ({
			selectors,
			expected,
		}) => {
			expect(canGroupTogether(selectors)).toBe(expected);
		});
	});

	describe("groupByStructure", () => {
		test("should group selectors by structure", () => {
			const selectors = [
				{
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
					selector: ".a:hover",
				},
				{
					nodes: [
						{ type: "class", value: ".b" },
						{ type: "pseudo", value: ":focus" },
					],
					selector: ".b:focus",
				},
				{ nodes: [{ type: "class", value: ".c" }], selector: ".c" },
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
		describe("successful grouping", () => {
			test.each([
				{
					expects: [".a, .b", "&:hover, &:focus", "color: red"],
					group: [
						{
							nodes: [
								{ type: "class", value: ".a" },
								{ type: "pseudo", value: ":hover" },
							],
							selector: ".a:hover",
						},
						{
							nodes: [
								{ type: "class", value: ".b" },
								{ type: "pseudo", value: ":focus" },
							],
							selector: ".b:focus",
						},
					],
				},
				{
					expects: [".x, .y", "display: block"],
					group: [
						{
							nodes: [{ type: "class", value: ".x" }],
							selector: ".x",
						},
						{
							nodes: [{ type: "class", value: ".y" }],
							selector: ".y",
						},
					],
				},
			])("should build nested rules", ({ group, expects }) => {
				const isColorTest = expects.some((e) => e === "color: red");
				const declarations = [
					postcss.decl({
						prop: isColorTest ? "color" : "display",
						value: isColorTest ? "red" : "block",
					}),
				];
				const root = postcss.root();

				const result = buildStructureGroup(group, declarations, root);

				expect(result).toBe(true);
				const output = root.toString();
				for (const expected of expects) {
					expect(output).toContain(expected);
				}
			});
		});

		describe("non-space combinators - should not group", () => {
			test.each([
				{
					combinator: ">",
					description: "child combinator",
				},
				{
					combinator: "+",
					description: "adjacent sibling",
				},
				{
					combinator: "~",
					description: "general sibling",
				},
			])("should return false for $description", ({ combinator }) => {
				const group = [
					{
						nodes: [
							{ type: "class", value: ".a" },
							{ type: "combinator", value: combinator },
							{ type: "class", value: ".b" },
						],
						selector: `.a ${combinator} .b`,
					},
					{
						nodes: [
							{ type: "class", value: ".c" },
							{ type: "combinator", value: combinator },
							{ type: "class", value: ".d" },
						],
						selector: `.c ${combinator} .d`,
					},
				];
				const declarations = [postcss.decl({ prop: "color", value: "blue" })];
				const root = postcss.root();

				const result = buildStructureGroup(group, declarations, root);

				expect(result).toBe(false);
				// Should not have added any rules
				expect(root.nodes).toHaveLength(0);
			});
		});

		test("should handle empty group", () => {
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const result = buildStructureGroup([], declarations, root);

			expect(result).toBe(false);
			expect(root.nodes).toHaveLength(0);
		});

		test("should handle single selector group", () => {
			const group = [
				{
					nodes: [
						{ type: "class", value: ".a" },
						{ type: "pseudo", value: ":hover" },
					],
					selector: ".a:hover",
				},
			];
			const declarations = [postcss.decl({ prop: "color", value: "red" })];
			const root = postcss.root();

			const result = buildStructureGroup(group, declarations, root);

			expect(result).toBe(true);
			const output = root.toString();
			expect(output).toContain(".a");
			expect(output).toContain("&:hover");
			expect(output).toContain("color: red");
		});
	});
});

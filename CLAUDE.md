# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

css2scss - CLI utility that converts flat CSS to nested SCSS using an LCP (Longest Common Prefix) trie-based approach. 100% data preservation guarantee.

## Commands

```bash
# Run the CLI
bun run bin/cli.js input.css [output.scss]

# Run all tests
bun test

# Run a single test file
bun test tests/core/transformer.test.js

# Run tests matching a name pattern
bun test -t "handles pseudo-class"

# Build standalone executable
bun run build

# Lint/format (Biome)
npx @biomejs/biome check .
npx @biomejs/biome check --write .
```

## Architecture

Single-pass transformation pipeline:

```
CSS String → PostCSS Parse → Selector Trie Insert → LCP Find → Build Nested Rules → SCSS Output
```

`transformCSS()` in `src/core/transformer.js` orchestrates everything: it parses CSS with PostCSS, groups rules by identical selectors, then applies a priority-based strategy dispatcher:

1. **Single Selector** — when only one selector or LCP covers the entire selector
2. **Flat Output** — for non-space combinators (`>`, `+`, `~`) that can't be nested
3. **Structure Grouping** — when no LCP exists, groups by structural patterns (e.g., `class|pseudo`)
4. **LCP Grouping** — default strategy using longest common prefix from the trie

### Core modules

| Module | Role |
|---|---|
| `src/core/transformer.js` | Main transformation logic, strategy dispatching, media query handling |
| `src/core/selector-trie.js` | Trie data structure for LCP finding; selectors stored only at terminal nodes |
| `src/core/selector-builder.js` | Builds SCSS selector strings from parsed nodes; handles `&` prefix logic |
| `src/core/structure-grouper.js` | Groups selectors by structural pattern when no LCP exists |

### Entry points

- `src/index.js` — exports `convertCSS()`, `convertFile()`, `convertDirectory()`
- `bin/cli.js` — CLI via Commander.js

### Dependencies

- **postcss** — CSS parsing into AST
- **postcss-selector-parser** — selector parsing and node traversal
- **fast-glob** — file pattern matching for directory conversion
- **commander** — CLI framework
- **chalk** — terminal output colors

## Code Style

- **Indentation**: Tabs (enforced by Biome)
- **Quotes**: Double quotes
- **Module system**: ES modules (`"type": "module"` in package.json)
- **Linter/Formatter**: Biome (see `biome.json`)

## Tests

Tests live in `tests/` with subdirectories mirroring `src/`:
- `tests/core/` — transformer, selector-trie, selector-builder, structure-grouper, edge-cases, performance
- `tests/utils/` — file utility tests
- `tests/index.test.js` — public API integration tests
- `tests/fixtures/` — CSS/SCSS fixture files organized by category (simple, nested, combinators, real-world, poc)

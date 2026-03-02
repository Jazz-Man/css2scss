# css2scss

> Modern CLI utility for converting CSS to SCSS with automatic selector nesting

**Fast and lightweight** CLI tool that transforms flat CSS into nested SCSS structure while preserving 100% of the original data.

## Features

- ✨ **Automatic Nesting** - Intelligently nests selectors using SCSS `&` syntax
  - Chained classes: `.a.b` → `.a { &.b { } }`
  - Pseudo-classes: `.a:hover` → `.a { &:hover { } }`
  - Combined: `.a.b:hover` → `.a { &.b { &:hover { } } }`
- 🔗 **Comma-Separated Selector Merging** - Combines selectors with identical declarations
  - `.a:hover, .a:hover .b` → `.a { &:hover, &:hover .b { } }`
- 🔄 **@media Query Support** - Preserves and nests media queries correctly
- 📦 **At-rule Preservation** - Keeps `@keyframes`, `@supports`, `@font-face` intact
- 🎯 **100% Data Preservation** - No CSS data is lost during conversion
- ⚡ **Cross-Platform** - Works with Node.js 18+ and Bun
- 🛠️ **CLI & API** - Use as command-line tool or programmatic library

## Installation

```bash
# Install globally
npm install -g @jazz-man/css2scss

# Or use directly with npx
npx @jazz-man/css2scss input.css output.scss
```

## Usage

### Command Line

```bash
# Convert single file (outputs to input.scss by default)
css2scss input.css

# Specify output file
css2scss input.css output.scss

# Convert directory recursively
css2scss src/css/ dist/scss/ --recursive

# Custom output extension
css2scss input.css --ext .sass

# Verbose mode
css2scss input.css -v

# Quiet mode (errors only)
css2scss input.css -q
```

### Programmatic API

```javascript
import { convertCSS, convertFile, convertDirectory } from '@jazz-man/css2scss';

// Convert CSS string
const scss = await convertCSS('.a:hover { color: red; }');
console.log(scss);
// Output:
// .a {
//   &:hover {
//     color: red;
//   }
// }

// Convert file
await convertFile('input.css', 'output.scss');

// Convert directory
await convertDirectory('src/css/', 'dist/scss/', { recursive: true });
```

## Conversion Examples

### Chained Classes

**Input CSS:**
```css
.card {
    background: white;
}

.card.header {
    color: black;
}

.card.header:hover {
    color: blue;
}
```

**Output SCSS:**
```scss
.card {
    background: white;

    .header {
        color: black;

        &:hover {
            color: blue;
        }
    }
}
```

### Pseudo-classes

**Input CSS:**
```css
.button {
    padding: 10px;
}

.button:hover {
    background: blue;
}

.button:active {
    transform: scale(0.98);
}
```

**Output SCSS:**
```scss
.button {
    padding: 10px;

    &:hover {
        background: blue;
    }

    &:active {
        transform: scale(0.98);
    }
}
```

### Comma-Separated Selectors

**Input CSS:**
```css
.card:hover,
.card:hover .title {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

**Output SCSS:**
```scss
.card {
    &:hover,
    &:hover .title {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
}
```

### Complex Selectors

**Input CSS:**
```css
.container {
    width: 100%;
}

@media (max-width: 768px) {
    .container {
        width: 100%;
    }
}
```

**Output SCSS:**
```scss
.container {
    width: 100%;

    @media (max-width: 768px) {
        width: 100%;
    }
}
```

### Special Cases

**`:root` selector** - Treated as standalone (not nested):
```css
/* Input */
:root {
    --color: red;
}

/* Output */
:root {
    --color: red;
}
```

## Architecture

The converter uses an LCP (Longest Common Prefix) trie-based approach for optimal selector grouping:

```
CSS String → PostCSS Parse → Selector Trie Insert → LCP Find → Build Nested → SCSS Output
```

### Core Modules

#### `src/core/transformer.js`
- Main transformation orchestration
- Strategy pattern for different selector types (single, flat, structure-based, LCP)
- @media query handling with proper nesting

#### `src/core/selector-trie.js`
- Trie data structure for efficient LCP finding
- Memory-efficient storage (selectors only at terminal nodes)
- Support for all CSS selector types

#### `src/core/selector-builder.js`
- Helper utilities for building SCSS rule selectors
- Ampersand (`&`) prefix handling
- Support for all CSS combinator types

#### `src/core/structure-grouper.js`
- Structure-based grouping when no LCP exists
- Groups selectors by structural patterns

### Transformation Strategies

The transformer uses a priority-based strategy dispatcher:

1. **Single Selector** - When only one selector or LCP covers entire selector
2. **Flat Output** - For non-space combinators (`>`, `+`, `~`)
3. **Structure Grouping** - When no LCP exists between selectors
4. **LCP Grouping** - Default strategy using longest common prefix

## Development

```bash
# Install dependencies
bun install

# Run CLI
bun run bin/cli.js input.css

# Run tests
bun test

# Build standalone executable
bun run build

# Lint/format (Biome)
npx @biomejs/biome check .
npx @biomejs/biome check --write .
```

## Project Structure

```
css2scss/
├── bin/
│   └── cli.js                 # CLI entry point (Commander.js)
├── src/
│   ├── index.js               # Public API exports
│   ├── core/
│   │   ├── transformer.js     # Main transformation logic
│   │   ├── selector-trie.js   # Trie for LCP finding
│   │   ├── selector-builder.js # Selector building utilities
│   │   └── structure-grouper.js # Structure-based grouping
│   └── utils/
│       ├── file.js            # File I/O with validation
│       ├── logger.js          # CLI logger (Chalk)
│       └── debug.js           # Debug utilities
├── tests/
│   ├── transformer.test.js    # Core transformation tests
│   ├── selector-trie.test.js  # Trie data structure tests
│   ├── selector-builder.test.js # Selector utilities tests
│   ├── structure-grouper.test.js # Structure grouping tests
│   ├── edge-cases.test.js     # Edge case coverage
│   ├── performance.test.js    # Performance benchmarks
│   ├── index.test.js          # Public API tests
│   └── file.test.js           # File utility tests
├── package.json
├── biome.json                 # Biome config (linter/formatter)
└── CLAUDE.md                  # Project documentation
```

## Dependencies

- **postcss** ^8.4.35 - CSS parsing and AST manipulation
- **postcss-selector-parser** ^7.1.1 - Selector parsing and analysis
- **fast-glob** ^3.3.2 - Fast file pattern matching
- **commander** ^12.0.0 - CLI framework
- **chalk** ^5.3.0 - Terminal colors

## Engine

Requires **Node.js** >= 18.0.0 (also compatible with Bun)

## License

MIT

## Repository

https://github.com/Jazz-Man/css2scss

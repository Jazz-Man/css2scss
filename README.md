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

# Remove comments
css2scss input.css --no-comments

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

The converter uses a 3-stage pipeline:

```
CSS String → [Parser] → PostCSS AST → [Transformer] → Nested AST → [Generator] → SCSS String
```

### Parser (`src/core/parser.js`)
- Uses PostCSS to parse CSS string into AST
- Handles parsing errors gracefully

### Transformer (`src/core/transformer.js`)
- Uses **postcss-selector-parser** for AST-based selector analysis
- No regex - relies on parser API for reliability
- Groups selectors by path and declarations for comma-separated merging
- Key functions:
  - `getNodes()` - Extract AST nodes from selector
  - `splitBaseChild()` - Split into base/child parts for nesting
  - `parseSelectorPath()` - Build nesting path from AST
  - `findOrCreateRuleAtPath()` - Create nested rule structure

### Generator (`src/index.js`)
- Uses **postcss-scss** syntax stringifier for proper SCSS output
- Maintains proper formatting and indentation

## Development

```bash
# Install dependencies
npm install

# Run CLI
node bin/cli.js input.css

# Run tests
npm test

# Build standalone executable
npm run build

# Lint/format
npx @biomejs/biome check .
npx @biomejs/biome check --write .
```

## Project Structure

```
css2scss/
├── bin/
│   └── cli.js              # CLI entry point (Commander.js)
├── src/
│   ├── core/
│   │   ├── parser.js        # CSS → AST parser
│   │   └── transformer.js   # AST nesting transformer
│   ├── index.js             # Main API exports
│   └── utils/
│       ├── debug.js        # Debug utilities
│       ├── file.js          # File I/O (Node.js fs/promises)
│       └── logger.js       # CLI logger (Chalk)
├── package.json
├── biome.json              # Biome config (linter/formatter)
└── CLAUDE.md               # Project documentation
```

## Dependencies

- **postcss** ^8.4.35 - CSS parsing and AST manipulation
- **postcss-selector-parser** ^7.1.1 - Selector parsing and analysis
- **postcss-scss** ^4.0.9 - SCSS syntax stringifier
- **fast-glob** ^3.3.2 - Fast file pattern matching
- **commander** ^12.0.0 - CLI framework
- **chalk** ^5.3.0 - Terminal colors

## Engine

Requires **Node.js** >= 18.0.0 (also compatible with Bun)

## License

MIT

## Repository

https://github.com/Jazz-Man/css2scss

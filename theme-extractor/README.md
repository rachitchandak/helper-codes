# Style Intelligence Layer

> Static style analysis module for WCAG agentic accessibility systems.

Extracts all color-related styling intelligence from a frontend project into a structured `theme-context.json` that can be shared across distributed WCAG worker agents.

## Features

- **CSS/SCSS Parsing** — PostCSS-based static analysis (no browser required)
- **CSS Variable Resolution** — Recursive `var()` resolution with cycle detection
- **Tailwind Extraction** — Dynamic config loading with nested color flattening
- **Class Mapping** — Selector → resolved color property mapping
- **Color Normalization** — All formats normalized to 6-digit hex

## Installation

```bash
npm install
```

## Usage

```typescript
import { extract } from './src/style-intelligence';

async function main() {
  const themeContext = await extract('/path/to/your/project', {
    debug: true, // optional: enable console logging
  });

  console.log('Raw CSS Variables:', themeContext.rawCssVariables);
  console.log('Resolved Variables:', themeContext.resolvedCssVariables);
  console.log('Hardcoded Colors:', themeContext.hardcodedColors);
  console.log('Class Map:', themeContext.classMap);
  console.log('Tailwind Colors:', themeContext.tailwindColors);
  console.log('Tailwind Utilities:', themeContext.tailwindUtilities);

  // Output is also written to:
  // /path/to/your/project/accessibility/theme-context.json
}

main();
```

## Output Shape

```json
{
  "rawCssVariables": {
    "--primary": "#1a73e8",
    "--secondary": "var(--primary)"
  },
  "resolvedCssVariables": {
    "--primary": "#1a73e8",
    "--secondary": "#1a73e8"
  },
  "hardcodedColors": ["#222222", "#333333", "#ffffff"],
  "classMap": {
    ".card": {
      "background": "#ffffff",
      "color": "#222222"
    }
  },
  "tailwindColors": {
    "blue-500": "#3b82f6",
    "primary": "#1a73e8"
  },
  "tailwindUtilities": {
    "bg-blue-500": "#3b82f6",
    "bg-primary": "#1a73e8",
    "text-blue-500": "#3b82f6",
    "text-primary": "#1a73e8"
  }
}
```

## Testing

```bash
npm test
```

## Architecture

```
src/style-intelligence/
├── index.ts              # Barrel exports
├── types.ts              # Shared TypeScript interfaces
├── ColorUtils.ts         # Color normalization (hex/rgb/hsl)
├── FileScanner.ts        # fast-glob project scanning
├── CssParser.ts          # PostCSS + SCSS parsing
├── VariableResolver.ts   # Recursive var() resolution
├── TailwindExtractor.ts  # Tailwind config extraction
├── ClassMapper.ts        # Selector → color mapping
└── ThemeExtractor.ts     # Orchestrator + JSON output
```

## Integration with WCAG Agents

Workers receive:
- File content
- WCAG knowledge base
- `theme-context.json`

They use `resolvedCssVariables`, `classMap`, and `tailwindUtilities` to infer foreground/background color pairs for contrast evaluation.

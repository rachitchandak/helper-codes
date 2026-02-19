/**
 * ThemeExtractor — Orchestrator for the Style Intelligence Layer.
 *
 * Coordinates all sub-modules to produce a complete ThemeContext
 * and writes the result to accessibility/theme-context.json.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { ThemeContext, ExtractOptions, CssDeclaration } from './types';
import { scanFiles } from './FileScanner';
import { parseCssFiles } from './CssParser';
import { resolveVariables } from './VariableResolver';
import { extractTailwindColors } from './TailwindExtractor';
import { mapClasses } from './ClassMapper';
import { normalizeColor, isColorValue, isResolvedColor } from './ColorUtils';

/**
 * Extract the complete theme context from a project directory.
 *
 * @param rootDir - Absolute path to the project root to analyze.
 * @param options - Optional configuration (e.g. debug logging).
 * @returns The assembled ThemeContext object.
 */
export async function extract(
    rootDir: string,
    options: ExtractOptions = {}
): Promise<ThemeContext> {
    const { debug = false } = options;
    const log = debug ? console.log.bind(console, '[StyleIntelligence]') : noop;

    // 1. Scan project files
    log('Scanning files...');
    const scannedFiles = await scanFiles(rootDir);
    log(`Found ${scannedFiles.cssFiles.length} CSS, ${scannedFiles.scssFiles.length} SCSS files`);

    // 2. Parse all CSS/SCSS files
    log('Parsing stylesheets...');
    const allStyleFiles = [...scannedFiles.cssFiles, ...scannedFiles.scssFiles];
    const declarations = await parseCssFiles(allStyleFiles);
    log(`Extracted ${declarations.length} declarations`);

    // 3. Build raw CSS variables map (Removed as per requirement)
    // const rawCssVariables = buildRawVariablesMap(declarations);
    // log(`Found ${Object.keys(rawCssVariables).length} CSS variables`);

    // 4. Resolve CSS variables
    // We need to build the raw map just for resolution, but we won't export it
    const rawCssVariables = buildRawVariablesMap(declarations);
    log('Resolving CSS variables...');
    const resolvedCssVariables = resolveVariables(rawCssVariables);
    log(`Resolved ${Object.keys(resolvedCssVariables).length} variables to colors`);

    // 5. Extract Tailwind colors (if config exists)
    let tailwindColors: Record<string, string> = {};
    let tailwindUtilities: Record<string, string> = {};

    if (scannedFiles.tailwindConfigPath) {
        log(`Loading Tailwind config: ${scannedFiles.tailwindConfigPath}`);
        const tailwindResult = await extractTailwindColors(scannedFiles.tailwindConfigPath);
        tailwindColors = tailwindResult.tailwindColors;
        tailwindUtilities = tailwindResult.tailwindUtilities;
        log(`Extracted ${Object.keys(tailwindColors).length} Tailwind colors`);
    } else {
        log('No Tailwind config found');
    }

    // 6. Build class → color map
    log('Building class color map...');
    const classMap = mapClasses(declarations, resolvedCssVariables);
    log(`Mapped ${Object.keys(classMap).length} selectors`);

    // 7. Collect hardcoded colors
    const hardcodedColors = collectHardcodedColors(declarations);
    log(`Found ${hardcodedColors.length} unique hardcoded colors`);

    // 8. Assemble final context
    const themeContext: ThemeContext = {
        // rawCssVariables: sortKeys(rawCssVariables), // Removed
        resolvedCssVariables: sortKeys(resolvedCssVariables),
        hardcodedColors,
        classMap,
        tailwindColors,
        tailwindUtilities,
    };

    // 9. Write output JSON
    const outputDir = path.join(rootDir, 'accessibility');
    const outputPath = path.join(outputDir, 'theme-context.json');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(themeContext, null, 2), 'utf-8');
    log(`Wrote theme context to ${outputPath}`);

    return themeContext;
}

/**
 * Build a map of CSS variable name → raw value from declarations.
 */
function buildRawVariablesMap(
    declarations: CssDeclaration[]
): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const decl of declarations) {
        if (decl.property.startsWith('--')) {
            vars[decl.property] = decl.value;
        }
    }
    return vars;
}

/**
 * Collect all unique hardcoded color values from declarations.
 * Returns a sorted, deduplicated array of normalized hex colors.
 */
function collectHardcodedColors(
    declarations: CssDeclaration[]
): string[] {
    const colors = new Set<string>();

    for (const decl of declarations) {
        // Skip CSS variable declarations — those go into rawCssVariables
        if (decl.property.startsWith('--')) {
            continue;
        }

        const value = decl.value.trim();

        // Skip var() references — not hardcoded
        if (value.includes('var(')) {
            continue;
        }

        if (isColorValue(value)) {
            const normalized = normalizeColor(value);
            if (isResolvedColor(normalized) || normalized === 'transparent') {
                colors.add(normalized);
            }
        }
    }

    return Array.from(colors).sort();
}

/** Sort object keys alphabetically. */
function sortKeys(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}

/** No-op function for disabled logging. */
function noop(..._args: unknown[]): void {
    // intentionally empty
}

"use strict";
/**
 * ThemeExtractor — Orchestrator for the Style Intelligence Layer.
 *
 * Coordinates all sub-modules to produce a complete ThemeContext
 * and writes the result to accessibility/theme-context.json.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = extract;
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const FileScanner_1 = require("./FileScanner");
const CssParser_1 = require("./CssParser");
const VariableResolver_1 = require("./VariableResolver");
const TailwindExtractor_1 = require("./TailwindExtractor");
const ClassMapper_1 = require("./ClassMapper");
const ColorUtils_1 = require("./ColorUtils");
/**
 * Extract the complete theme context from a project directory.
 *
 * @param rootDir - Absolute path to the project root to analyze.
 * @param options - Optional configuration (e.g. debug logging).
 * @returns The assembled ThemeContext object.
 */
async function extract(rootDir, options = {}) {
    const { debug = false } = options;
    const log = debug ? console.log.bind(console, '[StyleIntelligence]') : noop;
    // 1. Scan project files
    log('Scanning files...');
    const scannedFiles = await (0, FileScanner_1.scanFiles)(rootDir);
    log(`Found ${scannedFiles.cssFiles.length} CSS, ${scannedFiles.scssFiles.length} SCSS files`);
    // 2. Parse all CSS/SCSS files
    log('Parsing stylesheets...');
    const allStyleFiles = [...scannedFiles.cssFiles, ...scannedFiles.scssFiles];
    const declarations = await (0, CssParser_1.parseCssFiles)(allStyleFiles);
    log(`Extracted ${declarations.length} declarations`);
    // 3. Build raw CSS variables map (Removed as per requirement)
    // const rawCssVariables = buildRawVariablesMap(declarations);
    // log(`Found ${Object.keys(rawCssVariables).length} CSS variables`);
    // 4. Resolve CSS variables
    // We need to build the raw map just for resolution, but we won't export it
    const rawCssVariables = buildRawVariablesMap(declarations);
    log('Resolving CSS variables...');
    const resolvedCssVariables = (0, VariableResolver_1.resolveVariables)(rawCssVariables);
    log(`Resolved ${Object.keys(resolvedCssVariables).length} variables to colors`);
    // 5. Extract Tailwind colors (if config exists)
    let tailwindColors = {};
    let tailwindUtilities = {};
    if (scannedFiles.tailwindConfigPath) {
        log(`Loading Tailwind config: ${scannedFiles.tailwindConfigPath}`);
        const tailwindResult = await (0, TailwindExtractor_1.extractTailwindColors)(scannedFiles.tailwindConfigPath);
        tailwindColors = tailwindResult.tailwindColors;
        tailwindUtilities = tailwindResult.tailwindUtilities;
        log(`Extracted ${Object.keys(tailwindColors).length} Tailwind colors`);
    }
    else {
        log('No Tailwind config found');
    }
    // 6. Build class → color map
    log('Building class color map...');
    const classMap = (0, ClassMapper_1.mapClasses)(declarations, resolvedCssVariables);
    log(`Mapped ${Object.keys(classMap).length} selectors`);
    // 7. Collect hardcoded colors
    const hardcodedColors = collectHardcodedColors(declarations);
    log(`Found ${hardcodedColors.length} unique hardcoded colors`);
    // 8. Assemble final context
    const themeContext = {
        // rawCssVariables: sortKeys(rawCssVariables), // Removed
        resolvedCssVariables: sortKeys(resolvedCssVariables),
        hardcodedColors,
        classMap,
        tailwindColors,
        tailwindUtilities,
    };
    // 9. Write output JSON
    const outputDir = path_1.default.join(rootDir, 'accessibility');
    const outputPath = path_1.default.join(outputDir, 'theme-context.json');
    await fs_1.promises.mkdir(outputDir, { recursive: true });
    await fs_1.promises.writeFile(outputPath, JSON.stringify(themeContext, null, 2), 'utf-8');
    log(`Wrote theme context to ${outputPath}`);
    return themeContext;
}
/**
 * Build a map of CSS variable name → raw value from declarations.
 */
function buildRawVariablesMap(declarations) {
    const vars = {};
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
function collectHardcodedColors(declarations) {
    const colors = new Set();
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
        if ((0, ColorUtils_1.isColorValue)(value)) {
            const normalized = (0, ColorUtils_1.normalizeColor)(value);
            if ((0, ColorUtils_1.isResolvedColor)(normalized) || normalized === 'transparent') {
                colors.add(normalized);
            }
        }
    }
    return Array.from(colors).sort();
}
/** Sort object keys alphabetically. */
function sortKeys(obj) {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}
/** No-op function for disabled logging. */
function noop(..._args) {
    // intentionally empty
}
//# sourceMappingURL=ThemeExtractor.js.map
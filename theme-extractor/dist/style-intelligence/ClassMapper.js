"use strict";
/**
 * ClassMapper — Maps CSS selectors to their resolved color properties.
 *
 * Takes parsed CSS declarations and resolved variable map,
 * resolves var() references, normalizes colors, and produces
 * a selector → { color, background, borderColor } map.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapClasses = mapClasses;
const ColorUtils_1 = require("./ColorUtils");
/** Regex to extract var() references from a value. */
const VAR_REFERENCE_RE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/g;
/** Properties we map and their output key names. */
const PROPERTY_MAP = {
    'color': 'color',
    'background': 'background',
    'background-color': 'background',
    'border-color': 'borderColor',
};
/**
 * Map CSS selectors to their resolved color properties, grouped by file.
 *
 * @param declarations - Parsed CSS declarations from CssParser.
 * @param resolvedVars - Resolved CSS variable map from VariableResolver.
 * @returns Map of files to selectors to their color properties.
 */
function mapClasses(declarations, resolvedVars) {
    const classMap = {};
    for (const decl of declarations) {
        const outputKey = PROPERTY_MAP[decl.property];
        if (!outputKey) {
            continue;
        }
        // Resolve the value
        const resolved = resolveValueWithVars(decl.value, resolvedVars);
        if (resolved === null) {
            continue;
        }
        // Only include if it resolved to a color
        if (!(0, ColorUtils_1.isResolvedColor)(resolved) && !(0, ColorUtils_1.isColorValue)(resolved)) {
            continue;
        }
        const normalized = (0, ColorUtils_1.isResolvedColor)(resolved) ? resolved : (0, ColorUtils_1.normalizeColor)(resolved);
        const fileName = decl.file;
        if (!classMap[fileName]) {
            classMap[fileName] = {};
        }
        if (!classMap[fileName][decl.selector]) {
            classMap[fileName][decl.selector] = {};
        }
        classMap[fileName][decl.selector][outputKey] = normalized;
    }
    return sortClassMap(classMap);
}
/**
 * Resolve var() references in a value using the resolved variables map.
 *
 * @param value - Raw CSS value, potentially containing var() references.
 * @param resolvedVars - Map of CSS variable names to resolved values.
 * @returns The resolved value, or null if unresolvable.
 */
function resolveValueWithVars(value, resolvedVars) {
    let current = value.trim();
    // If no var() references, just normalize directly
    if (!current.includes('var(')) {
        return current;
    }
    // Replace all var() references
    let iterations = 0;
    while (current.includes('var(') && iterations < 20) {
        iterations++;
        const re = new RegExp(VAR_REFERENCE_RE.source);
        const match = re.exec(current);
        if (!match)
            break;
        const [fullMatch, token, fallback] = match;
        if (token in resolvedVars) {
            current = current.replace(fullMatch, resolvedVars[token]);
        }
        else if (fallback !== undefined) {
            const normalizedFallback = (0, ColorUtils_1.normalizeColor)(fallback.trim());
            current = current.replace(fullMatch, normalizedFallback);
        }
        else {
            return null;
        }
    }
    return current;
}
/** Sort the class map by file paths and then selector keys alphabetically. */
function sortClassMap(map) {
    const sorted = {};
    for (const fileKey of Object.keys(map).sort()) {
        sorted[fileKey] = {};
        for (const selectorKey of Object.keys(map[fileKey]).sort()) {
            sorted[fileKey][selectorKey] = map[fileKey][selectorKey];
        }
    }
    return sorted;
}
//# sourceMappingURL=ClassMapper.js.map
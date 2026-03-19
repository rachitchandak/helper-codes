"use strict";
/**
 * VariableResolver — Recursively resolves CSS custom property references.
 *
 * Handles:
 * - Simple var(--token) references
 * - Fallback syntax var(--token, #fff)
 * - Nested var() chains
 * - Circular reference detection
 * - Max recursion depth protection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVariables = resolveVariables;
const ColorUtils_1 = require("./ColorUtils");
/** Maximum recursion depth to prevent runaway resolution. */
const MAX_DEPTH = 20;
/** Regex to match a var() reference, capturing token and optional fallback. */
const VAR_REFERENCE_RE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/;
/**
 * Resolve all CSS custom properties to their final color values.
 *
 * @param rawVars - Map of variable names (with --) to their raw declared values.
 * @returns Map of variable names to resolved hex color values.
 *          Only variables that resolve to an actual color are included.
 */
function resolveVariables(rawVars) {
    const resolved = {};
    for (const varName of Object.keys(rawVars)) {
        const visiting = new Set();
        const result = resolveValue(rawVars[varName], rawVars, visiting, 0);
        if (result !== null && (0, ColorUtils_1.isResolvedColor)(result)) {
            resolved[varName] = result;
        }
    }
    return resolved;
}
/**
 * Recursively resolve a single value string.
 *
 * @param value - The raw value to resolve.
 * @param rawVars - The complete variable map.
 * @param visiting - Set of variable names currently in the resolution chain (cycle detection).
 * @param depth - Current recursion depth.
 * @returns Resolved color string or null if unresolvable.
 */
function resolveValue(value, rawVars, visiting, depth) {
    if (depth > MAX_DEPTH) {
        return null;
    }
    const trimmed = value.trim();
    // Check if it's already a concrete color (no var references)
    if (!trimmed.includes('var(')) {
        if ((0, ColorUtils_1.isColorValue)(trimmed)) {
            return (0, ColorUtils_1.normalizeColor)(trimmed);
        }
        return trimmed;
    }
    // Try to resolve var() references
    let current = trimmed;
    let iterations = 0;
    while (current.includes('var(') && iterations < MAX_DEPTH) {
        iterations++;
        const match = VAR_REFERENCE_RE.exec(current);
        if (!match) {
            break;
        }
        const [fullMatch, token, fallback] = match;
        // Circular reference detection
        if (visiting.has(token)) {
            // Try fallback if available
            if (fallback !== undefined) {
                const fallbackResolved = resolveValue(fallback.trim(), rawVars, new Set(visiting), depth + 1);
                if (fallbackResolved !== null) {
                    current = current.replace(fullMatch, fallbackResolved);
                    continue;
                }
            }
            return null;
        }
        // Check if variable exists
        if (token in rawVars) {
            visiting.add(token);
            const tokenValue = resolveValue(rawVars[token], rawVars, visiting, depth + 1);
            visiting.delete(token);
            if (tokenValue !== null) {
                current = current.replace(fullMatch, tokenValue);
                continue;
            }
        }
        // Variable not found — try fallback
        if (fallback !== undefined) {
            const fallbackResolved = resolveValue(fallback.trim(), rawVars, new Set(visiting), depth + 1);
            if (fallbackResolved !== null) {
                current = current.replace(fullMatch, fallbackResolved);
                continue;
            }
        }
        // Cannot resolve
        return null;
    }
    // Final normalization
    if ((0, ColorUtils_1.isColorValue)(current)) {
        return (0, ColorUtils_1.normalizeColor)(current);
    }
    return current;
}
//# sourceMappingURL=VariableResolver.js.map
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

import { isResolvedColor, normalizeColor, isColorValue } from './ColorUtils';

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
export function resolveVariables(
    rawVars: Record<string, string>
): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const varName of Object.keys(rawVars)) {
        const visiting = new Set<string>();
        const result = resolveValue(rawVars[varName], rawVars, visiting, 0);
        if (result !== null && isResolvedColor(result)) {
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
function resolveValue(
    value: string,
    rawVars: Record<string, string>,
    visiting: Set<string>,
    depth: number
): string | null {
    if (depth > MAX_DEPTH) {
        return null;
    }

    const trimmed = value.trim();

    // Check if it's already a concrete color (no var references)
    if (!trimmed.includes('var(')) {
        if (isColorValue(trimmed)) {
            return normalizeColor(trimmed);
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
                const fallbackResolved = resolveValue(
                    fallback.trim(),
                    rawVars,
                    new Set(visiting),
                    depth + 1
                );
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
            const fallbackResolved = resolveValue(
                fallback.trim(),
                rawVars,
                new Set(visiting),
                depth + 1
            );
            if (fallbackResolved !== null) {
                current = current.replace(fullMatch, fallbackResolved);
                continue;
            }
        }

        // Cannot resolve
        return null;
    }

    // Final normalization
    if (isColorValue(current)) {
        return normalizeColor(current);
    }

    return current;
}

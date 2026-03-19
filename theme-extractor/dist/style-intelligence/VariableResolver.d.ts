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
/**
 * Resolve all CSS custom properties to their final color values.
 *
 * @param rawVars - Map of variable names (with --) to their raw declared values.
 * @returns Map of variable names to resolved hex color values.
 *          Only variables that resolve to an actual color are included.
 */
export declare function resolveVariables(rawVars: Record<string, string>): Record<string, string>;
//# sourceMappingURL=VariableResolver.d.ts.map
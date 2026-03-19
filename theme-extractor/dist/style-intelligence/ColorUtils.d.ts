/**
 * ColorUtils — Pure functions for color normalization and detection.
 *
 * Converts rgb, rgba, hsl, hsla, 3-digit hex, and named colors
 * to canonical 6-digit lowercase hex. Marks transparent values explicitly.
 */
/**
 * Check whether a raw string looks like a color value.
 * Returns true for hex, rgb(), rgba(), hsl(), hsla(), var() references, and "transparent".
 */
export declare function isColorValue(value: string): boolean;
/**
 * Normalize a raw color string to a canonical 6-digit lowercase hex value.
 *
 * - `rgb(r,g,b)` and `rgba(r,g,b,a)` → `#rrggbb` (alpha 0 → "transparent")
 * - `hsl(h,s%,l%)` and `hsla(h,s%,l%,a)` → `#rrggbb` (alpha 0 → "transparent")
 * - `#rgb` → `#rrggbb`
 * - `#rrggbb` → lowercase
 * - `#rrggbbaa` → `#rrggbb` (alpha 0 → "transparent")
 * - `transparent` → `"transparent"`
 * - Unrecognized values are returned as-is (trimmed + lowercased).
 */
export declare function normalizeColor(raw: string): string;
/**
 * Check whether a normalized value is a resolved color (hex or transparent).
 */
export declare function isResolvedColor(value: string): boolean;
//# sourceMappingURL=ColorUtils.d.ts.map
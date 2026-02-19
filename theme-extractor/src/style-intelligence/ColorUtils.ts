/**
 * ColorUtils — Pure functions for color normalization and detection.
 *
 * Converts rgb, rgba, hsl, hsla, 3-digit hex, and named colors
 * to canonical 6-digit lowercase hex. Marks transparent values explicitly.
 */

import convert from 'color-convert';

/** Regex patterns for color value detection. */
const HEX_3_RE = /^#([0-9a-fA-F]{3})$/;
const HEX_6_RE = /^#([0-9a-fA-F]{6})$/;
const HEX_8_RE = /^#([0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/;
const HSL_RE = /^hsla?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*(?:,\s*([0-9.]+)\s*)?\)$/;
const VAR_RE = /^var\(/;

/**
 * Check whether a raw string looks like a color value.
 * Returns true for hex, rgb(), rgba(), hsl(), hsla(), var() references, and "transparent".
 */
export function isColorValue(value: string): boolean {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'transparent') return true;
    if (HEX_3_RE.test(trimmed) || HEX_6_RE.test(trimmed) || HEX_8_RE.test(trimmed)) return true;
    if (RGB_RE.test(trimmed)) return true;
    if (HSL_RE.test(trimmed)) return true;
    if (VAR_RE.test(trimmed)) return true;
    return false;
}

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
export function normalizeColor(raw: string): string {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    // transparent keyword
    if (lower === 'transparent') {
        return 'transparent';
    }

    // 3-digit hex
    const hex3Match = HEX_3_RE.exec(lower);
    if (hex3Match) {
        const [, hex3] = hex3Match;
        const expanded = hex3[0] + hex3[0] + hex3[1] + hex3[1] + hex3[2] + hex3[2];
        return `#${expanded}`;
    }

    // 6-digit hex
    const hex6Match = HEX_6_RE.exec(lower);
    if (hex6Match) {
        return `#${hex6Match[1]}`;
    }

    // 8-digit hex (with alpha)
    const hex8Match = HEX_8_RE.exec(lower);
    if (hex8Match) {
        const hex8 = hex8Match[1];
        const alpha = parseInt(hex8.slice(6, 8), 16);
        if (alpha === 0) return 'transparent';
        return `#${hex8.slice(0, 6)}`;
    }

    // rgb / rgba
    const rgbMatch = RGB_RE.exec(trimmed);
    if (rgbMatch) {
        const r = clampByte(parseInt(rgbMatch[1], 10));
        const g = clampByte(parseInt(rgbMatch[2], 10));
        const b = clampByte(parseInt(rgbMatch[3], 10));
        const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
        if (a === 0) return 'transparent';
        return rgbToHex(r, g, b);
    }

    // hsl / hsla
    const hslMatch = HSL_RE.exec(trimmed);
    if (hslMatch) {
        const h = parseFloat(hslMatch[1]);
        const s = parseFloat(hslMatch[2]);
        const l = parseFloat(hslMatch[3]);
        const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
        if (a === 0) return 'transparent';
        const [r, g, b] = convert.hsl.rgb([h, s, l]);
        return rgbToHex(r, g, b);
    }

    // Unrecognized — return as-is lowercased
    return lower;
}

/**
 * Check whether a normalized value is a resolved color (hex or transparent).
 */
export function isResolvedColor(value: string): boolean {
    const v = value.trim().toLowerCase();
    return v === 'transparent' || HEX_6_RE.test(v);
}

/** Clamp a number to the 0-255 byte range. */
function clampByte(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

/** Convert RGB byte values to a 6-digit lowercase hex string. */
function rgbToHex(r: number, g: number, b: number): string {
    const hex = (
        (1 << 24) +
        (clampByte(r) << 16) +
        (clampByte(g) << 8) +
        clampByte(b)
    )
        .toString(16)
        .slice(1);
    return `#${hex}`;
}

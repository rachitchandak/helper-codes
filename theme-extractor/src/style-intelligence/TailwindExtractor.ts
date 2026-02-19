/**
 * TailwindExtractor — Extracts color tokens from tailwind.config.js/ts.
 *
 * Dynamically loads the Tailwind config, flattens nested color objects,
 * and generates utility class → color mappings.
 */

import path from 'path';
import { TailwindColorConfig, TailwindResult } from './types';
import { normalizeColor, isColorValue } from './ColorUtils';

/**
 * Extract Tailwind color tokens and generate utility mappings.
 *
 * @param configPath - Absolute path to the tailwind config file.
 * @returns Flattened color map and utility mappings.
 */
export async function extractTailwindColors(
    configPath: string
): Promise<TailwindResult> {
    const absolutePath = path.resolve(configPath);

    // Cache-bust the require to ensure fresh reads
    const resolvedPath = require.resolve(absolutePath);
    delete require.cache[resolvedPath];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(absolutePath) as TailwindConfigShape;

    const themeColors: TailwindColorConfig = {};

    // Merge theme.colors and theme.extend.colors
    if (config.theme?.colors) {
        mergeDeep(themeColors, config.theme.colors);
    }
    if (config.theme?.extend?.colors) {
        mergeDeep(themeColors, config.theme.extend.colors);
    }

    // Flatten nested objects
    const tailwindColors = flattenColors(themeColors);

    // Generate utility mappings
    const tailwindUtilities: Record<string, string> = {};
    for (const [name, hex] of Object.entries(tailwindColors)) {
        tailwindUtilities[`bg-${name}`] = hex;
        tailwindUtilities[`text-${name}`] = hex;
        tailwindUtilities[`border-${name}`] = hex;
    }

    return {
        tailwindColors: sortKeys(tailwindColors),
        tailwindUtilities: sortKeys(tailwindUtilities),
    };
}

/**
 * Flatten a nested Tailwind color config into a flat key-value map.
 *
 * Nested objects get keys joined with "-":
 *   { blue: { 500: "#3b82f6" } } → { "blue-500": "#3b82f6" }
 *
 * @param config - The nested color config object.
 * @param prefix - Current key prefix for recursion.
 * @returns Flat map of color name → normalized hex value.
 */
export function flattenColors(
    config: TailwindColorConfig,
    prefix = ''
): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(config)) {
        const fullKey = prefix ? `${prefix}-${key}` : key;

        if (typeof value === 'string') {
            if (isColorValue(value)) {
                result[fullKey] = normalizeColor(value);
            } else {
                result[fullKey] = value;
            }
        } else if (typeof value === 'object' && value !== null) {
            const nested = flattenColors(value, fullKey);
            Object.assign(result, nested);
        }
    }

    return result;
}

/** Shape we expect from a Tailwind config file. */
interface TailwindConfigShape {
    theme?: {
        colors?: TailwindColorConfig;
        extend?: {
            colors?: TailwindColorConfig;
        };
    };
}

/** Deep merge source into target. */
function mergeDeep(
    target: TailwindColorConfig,
    source: TailwindColorConfig
): void {
    for (const [key, value] of Object.entries(source)) {
        if (
            typeof value === 'object' &&
            value !== null &&
            typeof target[key] === 'object' &&
            target[key] !== null
        ) {
            mergeDeep(
                target[key] as TailwindColorConfig,
                value as TailwindColorConfig
            );
        } else {
            target[key] = value;
        }
    }
}

/** Sort an object's keys alphabetically. */
function sortKeys(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}

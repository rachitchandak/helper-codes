"use strict";
/**
 * TailwindExtractor — Extracts color tokens from tailwind.config.js/ts.
 *
 * Dynamically loads the Tailwind config, flattens nested color objects,
 * and generates utility class → color mappings.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTailwindColors = extractTailwindColors;
exports.flattenColors = flattenColors;
const path_1 = __importDefault(require("path"));
const ColorUtils_1 = require("./ColorUtils");
/**
 * Extract Tailwind color tokens and generate utility mappings.
 *
 * @param configPath - Absolute path to the tailwind config file.
 * @returns Flattened color map and utility mappings.
 */
async function extractTailwindColors(configPath) {
    const absolutePath = path_1.default.resolve(configPath);
    // Cache-bust the require to ensure fresh reads
    const resolvedPath = require.resolve(absolutePath);
    delete require.cache[resolvedPath];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(absolutePath);
    const themeColors = {};
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
    const tailwindUtilities = {};
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
function flattenColors(config, prefix = '') {
    const result = {};
    for (const [key, value] of Object.entries(config)) {
        const fullKey = prefix ? `${prefix}-${key}` : key;
        if (typeof value === 'string') {
            if ((0, ColorUtils_1.isColorValue)(value)) {
                result[fullKey] = (0, ColorUtils_1.normalizeColor)(value);
            }
            else {
                result[fullKey] = value;
            }
        }
        else if (typeof value === 'object' && value !== null) {
            const nested = flattenColors(value, fullKey);
            Object.assign(result, nested);
        }
    }
    return result;
}
/** Deep merge source into target. */
function mergeDeep(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'object' &&
            value !== null &&
            typeof target[key] === 'object' &&
            target[key] !== null) {
            mergeDeep(target[key], value);
        }
        else {
            target[key] = value;
        }
    }
}
/** Sort an object's keys alphabetically. */
function sortKeys(obj) {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}
//# sourceMappingURL=TailwindExtractor.js.map
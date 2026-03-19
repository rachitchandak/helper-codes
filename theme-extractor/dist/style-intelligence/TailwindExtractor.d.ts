/**
 * TailwindExtractor — Extracts color tokens from tailwind.config.js/ts.
 *
 * Dynamically loads the Tailwind config, flattens nested color objects,
 * and generates utility class → color mappings.
 */
import { TailwindColorConfig, TailwindResult } from './types';
/**
 * Extract Tailwind color tokens and generate utility mappings.
 *
 * @param configPath - Absolute path to the tailwind config file.
 * @returns Flattened color map and utility mappings.
 */
export declare function extractTailwindColors(configPath: string): Promise<TailwindResult>;
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
export declare function flattenColors(config: TailwindColorConfig, prefix?: string): Record<string, string>;
//# sourceMappingURL=TailwindExtractor.d.ts.map
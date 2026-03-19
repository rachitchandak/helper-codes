/**
 * ThemeExtractor — Orchestrator for the Style Intelligence Layer.
 *
 * Coordinates all sub-modules to produce a complete ThemeContext
 * and writes the result to accessibility/theme-context.json.
 */
import { ThemeContext, ExtractOptions } from './types';
/**
 * Extract the complete theme context from a project directory.
 *
 * @param rootDir - Absolute path to the project root to analyze.
 * @param options - Optional configuration (e.g. debug logging).
 * @returns The assembled ThemeContext object.
 */
export declare function extract(rootDir: string, options?: ExtractOptions): Promise<ThemeContext>;
//# sourceMappingURL=ThemeExtractor.d.ts.map
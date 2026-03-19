/**
 * FileScanner — Scans a project directory for style-related files.
 *
 * Uses fast-glob to locate CSS, SCSS, and Tailwind config files,
 * excluding node_modules.
 */
import { ScannedFiles } from './types';
/**
 * Scan the project directory for style files.
 *
 * @param rootDir - Absolute path to the project root.
 * @returns Categorized file paths.
 */
export declare function scanFiles(rootDir: string): Promise<ScannedFiles>;
//# sourceMappingURL=FileScanner.d.ts.map
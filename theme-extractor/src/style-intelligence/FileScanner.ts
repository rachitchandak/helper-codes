/**
 * FileScanner — Scans a project directory for style-related files.
 *
 * Uses fast-glob to locate CSS, SCSS, and Tailwind config files,
 * excluding node_modules.
 */

import fg from 'fast-glob';
import path from 'path';
import { ScannedFiles } from './types';

/**
 * Scan the project directory for style files.
 *
 * @param rootDir - Absolute path to the project root.
 * @returns Categorized file paths.
 */
export async function scanFiles(rootDir: string): Promise<ScannedFiles> {
    const normalizedRoot = rootDir.replace(/\\/g, '/');

    const [cssFiles, scssFiles, tailwindConfigs] = await Promise.all([
        fg('**/*.css', {
            cwd: normalizedRoot,
            ignore: ['**/node_modules/**'],
            absolute: true,
            onlyFiles: true,
        }),
        fg('**/*.scss', {
            cwd: normalizedRoot,
            ignore: ['**/node_modules/**'],
            absolute: true,
            onlyFiles: true,
        }),
        fg(['tailwind.config.js', 'tailwind.config.ts'], {
            cwd: normalizedRoot,
            ignore: ['**/node_modules/**'],
            absolute: true,
            onlyFiles: true,
        }),
    ]);

    // Normalize all paths to OS-native separators
    const normalize = (files: string[]): string[] =>
        files.map((f) => path.resolve(f)).sort();

    return {
        cssFiles: normalize(cssFiles),
        scssFiles: normalize(scssFiles),
        tailwindConfigPath: tailwindConfigs.length > 0 ? path.resolve(tailwindConfigs[0]) : null,
    };
}

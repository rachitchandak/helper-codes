"use strict";
/**
 * FileScanner — Scans a project directory for style-related files.
 *
 * Uses fast-glob to locate CSS, SCSS, and Tailwind config files,
 * excluding node_modules.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanFiles = scanFiles;
const fast_glob_1 = __importDefault(require("fast-glob"));
const path_1 = __importDefault(require("path"));
/**
 * Scan the project directory for style files.
 *
 * @param rootDir - Absolute path to the project root.
 * @returns Categorized file paths.
 */
async function scanFiles(rootDir) {
    const normalizedRoot = rootDir.replace(/\\/g, '/');
    const [cssFiles, scssFiles, tailwindConfigs] = await Promise.all([
        (0, fast_glob_1.default)('**/*.css', {
            cwd: normalizedRoot,
            ignore: ['**/node_modules/**'],
            absolute: true,
            onlyFiles: true,
        }),
        (0, fast_glob_1.default)('**/*.scss', {
            cwd: normalizedRoot,
            ignore: ['**/node_modules/**'],
            absolute: true,
            onlyFiles: true,
        }),
        (0, fast_glob_1.default)(['tailwind.config.js', 'tailwind.config.ts'], {
            cwd: normalizedRoot,
            ignore: ['**/node_modules/**'],
            absolute: true,
            onlyFiles: true,
        }),
    ]);
    // Normalize all paths to OS-native separators
    const normalize = (files) => files.map((f) => path_1.default.resolve(f)).sort();
    return {
        cssFiles: normalize(cssFiles),
        scssFiles: normalize(scssFiles),
        tailwindConfigPath: tailwindConfigs.length > 0 ? path_1.default.resolve(tailwindConfigs[0]) : null,
    };
}
//# sourceMappingURL=FileScanner.js.map
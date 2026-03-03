/**
 * File Scanner Module
 * Recursively scans a project directory for accessibility-relevant source files.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { globSync } from "glob";
import type { ScannedFile } from "./types.js";

/** Directories to always skip when scanning. */
const IGNORED_DIRS = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".cache",
    "__pycache__",
    ".svelte-kit",
    "vendor",
];

/** File extensions that are relevant for accessibility auditing. */
const RELEVANT_EXTENSIONS = [
    ".html",
    ".htm",
    ".css",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte",
    ".ejs",
    ".hbs",
    ".pug",
];

/** Maximum file size to read (500 KB) — skip very large files. */
const MAX_FILE_SIZE = 500 * 1024;

/**
 * Scan a project root directory and return all accessibility-relevant files.
 */
export function scanProject(projectRoot: string): ScannedFile[] {
    const absoluteRoot = path.resolve(projectRoot);

    if (!fs.existsSync(absoluteRoot)) {
        throw new Error(`Project root does not exist: ${absoluteRoot}`);
    }

    if (!fs.statSync(absoluteRoot).isDirectory()) {
        throw new Error(`Project root is not a directory: ${absoluteRoot}`);
    }

    // Build glob patterns for each extension
    const patterns = RELEVANT_EXTENSIONS.map(
        (ext) => `**/*${ext}`
    );

    const ignorePatterns = IGNORED_DIRS.map((dir) => `**/${dir}/**`);

    const matchedFiles: string[] = [];
    for (const pattern of patterns) {
        const files = globSync(pattern, {
            cwd: absoluteRoot,
            nodir: true,
            ignore: ignorePatterns,
            absolute: false,
            dot: false,
        });
        matchedFiles.push(...files);
    }

    // De-duplicate (in case glob returns overlaps)
    const uniqueFiles = [...new Set(matchedFiles)];

    const scannedFiles: ScannedFile[] = [];

    for (const relativePath of uniqueFiles) {
        const filePath = path.join(absoluteRoot, relativePath);

        try {
            const stats = fs.statSync(filePath);
            if (stats.size > MAX_FILE_SIZE) {
                console.warn(
                    `⚠  Skipping (too large, ${(stats.size / 1024).toFixed(0)} KB): ${relativePath}`
                );
                continue;
            }

            const content = fs.readFileSync(filePath, "utf-8");
            const extension = path.extname(filePath).toLowerCase();

            scannedFiles.push({
                filePath,
                relativePath: relativePath.replace(/\\/g, "/"),
                extension,
                content,
            });
        } catch (err) {
            console.warn(`⚠  Could not read file: ${relativePath}`, err);
        }
    }

    return scannedFiles;
}

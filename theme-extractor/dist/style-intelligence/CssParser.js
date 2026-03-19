"use strict";
/**
 * CssParser — Parses CSS/SCSS files using PostCSS with SCSS syntax support.
 *
 * Extracts declarations for CSS custom properties, color-related properties,
 * and values containing color functions or var() references.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCssFiles = parseCssFiles;
const postcss_1 = __importDefault(require("postcss"));
const postcss_scss_1 = __importDefault(require("postcss-scss"));
const fs_1 = require("fs");
const ColorUtils_1 = require("./ColorUtils");
/** Properties we always capture regardless of value. */
const COLOR_PROPERTIES = new Set([
    'color',
    'background',
    'background-color',
    'border-color',
]);
/**
 * Parse an array of CSS/SCSS file paths and extract color-related declarations.
 *
 * @param files - Absolute paths to CSS or SCSS files.
 * @returns Array of extracted declarations.
 */
async function parseCssFiles(files) {
    const declarations = [];
    const parsePromises = files.map(async (filePath) => {
        const content = await fs_1.promises.readFile(filePath, 'utf-8');
        const fileDeclarations = [];
        let root;
        try {
            root = (0, postcss_1.default)().process(content, {
                syntax: postcss_scss_1.default,
                from: filePath,
            }).root;
        }
        catch {
            // If a file cannot be parsed, skip it gracefully
            return fileDeclarations;
        }
        root.walk((node) => {
            if (node.type === 'decl') {
                const decl = node;
                const property = decl.prop;
                const value = decl.value;
                const shouldCapture = property.startsWith('--') ||
                    COLOR_PROPERTIES.has(property) ||
                    (0, ColorUtils_1.isColorValue)(value);
                if (shouldCapture) {
                    const selector = getSelector(decl);
                    fileDeclarations.push({
                        selector,
                        property,
                        value,
                        file: filePath,
                    });
                }
            }
        });
        return fileDeclarations;
    });
    const results = await Promise.all(parsePromises);
    for (const fileDecls of results) {
        declarations.push(...fileDecls);
    }
    return declarations;
}
/**
 * Walk up the tree to find the nearest selector for a declaration.
 */
function getSelector(decl) {
    let parent = decl.parent;
    while (parent) {
        if (parent.type === 'rule') {
            return parent.selector;
        }
        if (parent.type === 'atrule') {
            return `@${parent.name} ${parent.params}`;
        }
        parent = parent.parent;
    }
    return ':root';
}
//# sourceMappingURL=CssParser.js.map
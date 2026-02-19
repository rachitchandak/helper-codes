/**
 * CssParser — Parses CSS/SCSS files using PostCSS with SCSS syntax support.
 *
 * Extracts declarations for CSS custom properties, color-related properties,
 * and values containing color functions or var() references.
 */

import postcss, { Root, Rule, Declaration, AtRule, Document, Node } from 'postcss';
import scssSyntax from 'postcss-scss';
import { promises as fs } from 'fs';
import { CssDeclaration } from './types';
import { isColorValue } from './ColorUtils';

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
export async function parseCssFiles(files: string[]): Promise<CssDeclaration[]> {
    const declarations: CssDeclaration[] = [];

    const parsePromises = files.map(async (filePath) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileDeclarations: CssDeclaration[] = [];

        let root: Root | Document;
        try {
            root = postcss().process(content, {
                syntax: scssSyntax,
                from: filePath,
            }).root;
        } catch {
            // If a file cannot be parsed, skip it gracefully
            return fileDeclarations;
        }

        root.walk((node) => {
            if (node.type === 'decl') {
                const decl = node as Declaration;
                const property = decl.prop;
                const value = decl.value;

                const shouldCapture =
                    property.startsWith('--') ||
                    COLOR_PROPERTIES.has(property) ||
                    isColorValue(value);

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
function getSelector(decl: Declaration): string {
    let parent: Node | undefined = decl.parent as Node | undefined;
    while (parent) {
        if (parent.type === 'rule') {
            return (parent as Rule).selector;
        }
        if (parent.type === 'atrule') {
            return `@${(parent as AtRule).name} ${(parent as AtRule).params}`;
        }
        parent = (parent as Declaration).parent as Node | undefined;
    }
    return ':root';
}

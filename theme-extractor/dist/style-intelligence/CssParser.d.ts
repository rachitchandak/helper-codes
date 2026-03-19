/**
 * CssParser — Parses CSS/SCSS files using PostCSS with SCSS syntax support.
 *
 * Extracts declarations for CSS custom properties, color-related properties,
 * and values containing color functions or var() references.
 */
import { CssDeclaration } from './types';
/**
 * Parse an array of CSS/SCSS file paths and extract color-related declarations.
 *
 * @param files - Absolute paths to CSS or SCSS files.
 * @returns Array of extracted declarations.
 */
export declare function parseCssFiles(files: string[]): Promise<CssDeclaration[]>;
//# sourceMappingURL=CssParser.d.ts.map
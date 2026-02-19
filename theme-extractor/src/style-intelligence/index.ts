/**
 * Style Intelligence Layer — Public API.
 *
 * Usage:
 *   import { extract } from 'style-intelligence';
 *   const context = await extract('/path/to/project');
 */

export { extract } from './ThemeExtractor';
export { scanFiles } from './FileScanner';
export { parseCssFiles } from './CssParser';
export { resolveVariables } from './VariableResolver';
export { extractTailwindColors, flattenColors } from './TailwindExtractor';
export { mapClasses } from './ClassMapper';
export { normalizeColor, isColorValue, isResolvedColor } from './ColorUtils';

export type {
    ThemeContext,
    CssDeclaration,
    ClassColorMap,
    ClassColorEntry,
    ScannedFiles,
    TailwindResult,
    TailwindColorConfig,
    ExtractOptions,
} from './types';

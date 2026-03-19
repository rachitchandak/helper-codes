/**
 * Shared types for the Style Intelligence Layer.
 */
/** A single CSS declaration extracted from a stylesheet. */
export interface CssDeclaration {
    /** The CSS selector containing this declaration (e.g. ".card", ":root"). */
    selector: string;
    /** The CSS property name (e.g. "color", "--primary"). */
    property: string;
    /** The raw value as written in source (e.g. "var(--blue)", "#fff"). */
    value: string;
    /** Absolute path to the source file. */
    file: string;
}
/** Color properties resolved for a single CSS selector. */
export interface ClassColorEntry {
    color?: string;
    background?: string;
    borderColor?: string;
}
/** Map of file paths to their CSS selectors and resolved color properties. */
export type ClassColorMap = Record<string, Record<string, ClassColorEntry>>;
/** Result from scanning the project filesystem. */
export interface ScannedFiles {
    /** All .css file paths found. */
    cssFiles: string[];
    /** All .scss file paths found. */
    scssFiles: string[];
    /** Path to tailwind.config.js or .ts, or null if not found. */
    tailwindConfigPath: string | null;
}
/** Result from extracting Tailwind configuration colors. */
export interface TailwindResult {
    /** Flattened color name → hex map (e.g. "blue-500" → "#3b82f6"). */
    tailwindColors: Record<string, string>;
    /** Utility class → hex map (e.g. "bg-blue-500" → "#3b82f6"). */
    tailwindUtilities: Record<string, string>;
}
/**
 * Recursive Tailwind color config shape.
 * Values are either hex strings or nested objects of the same shape.
 */
export type TailwindColorConfig = {
    [key: string]: string | TailwindColorConfig;
};
/** The final theme context output shared with WCAG worker agents. */
export interface ThemeContext {
    /** Resolved CSS variables — only those that resolve to a color value. */
    resolvedCssVariables: Record<string, string>;
    /** Deduplicated, sorted list of all hardcoded color values found in the project. */
    hardcodedColors: string[];
    /** File → Selector → resolved color properties map. */
    classMap: ClassColorMap;
    /** Flattened Tailwind color tokens. */
    tailwindColors: Record<string, string>;
    /** Tailwind utility class → color mappings. */
    tailwindUtilities: Record<string, string>;
}
/** Options for the ThemeExtractor. */
export interface ExtractOptions {
    /** When true, log debug information to console. */
    debug?: boolean;
}
//# sourceMappingURL=types.d.ts.map
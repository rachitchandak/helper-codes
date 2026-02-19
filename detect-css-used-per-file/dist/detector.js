"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CssDetector = void 0;
class CssDetector {
    /**
     * Extracts CSS class names from the given content.
     * Matches typical class usage patterns like:
     * - class="className"
     * - className="className"
     * - .className (in CSS/SCSS)
     * - styles.className (in JS/TS modules)
     */
    static extractClassNames(content) {
        const classNames = new Set();
        // Regex for string literals that look like class names (simple approach)
        // This is a heuristic and might produce false positives/negatives depending on complexity
        // We look for words that might be class names.
        // 1. Look for class="..." or className="..."
        const attributeRegex = /(?:class|className)\s*=\s*["']([^"']+)["']/g;
        let match;
        while ((match = attributeRegex.exec(content)) !== null) {
            const classes = match[1].split(/\s+/);
            classes.forEach(c => {
                if (c.trim())
                    classNames.add(c.trim());
            });
        }
        // 2. Look for .className in style definitions (roughly)
        const cssDotRegex = /\.([a-zA-Z0-9_-]+)(?=\s*\{|\s*,|\s*:)/g;
        while ((match = cssDotRegex.exec(content)) !== null) {
            if (match[1].trim())
                classNames.add(match[1].trim());
        }
        return Array.from(classNames);
    }
    /**
     * Extracts CSS variables from the given content.
     * Matches:
     * - var(--variable-name)
     * - --variable-name: value
     */
    static extractCssVariables(content) {
        const variables = new Set();
        // Match --variable-name
        const variableRegex = /--([a-zA-Z0-9_-]+)/g;
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            if (match[0].trim())
                variables.add(match[0].trim());
        }
        return Array.from(variables);
    }
}
exports.CssDetector = CssDetector;

export class CssDetector {
    /**
     * Extracts CSS class names from the given content.
     * Matches typical class usage patterns like:
     * - class="className"
     * - className="className"
     * - .className (in CSS/SCSS)
     * - styles.className (in JS/TS modules)
     */
    static extractClassNames(content: string): string[] {
        const classNames = new Set<string>();

        // Regex for string literals that look like class names (simple approach)
        // This is a heuristic and might produce false positives/negatives depending on complexity
        // We look for words that might be class names.

        // 1. Look for class="..." or className="..."
        const attributeRegex = /(?:class|className)\s*=\s*["']([^"']+)["']/g;
        let match;
        while ((match = attributeRegex.exec(content)) !== null) {
            const classes = match[1].split(/\s+/);
            classes.forEach(c => {
                if (c.trim()) classNames.add(c.trim());
            });
        }

        // 2. Look for .className in style definitions (roughly)
        const cssDotRegex = /\.([a-zA-Z0-9_-]+)(?=\s*\{|\s*,|\s*:)/g;
        while ((match = cssDotRegex.exec(content)) !== null) {
            if (match[1].trim()) classNames.add(match[1].trim());
        }

        return Array.from(classNames);
    }

    /**
     * Extracts CSS variables from the given content.
     * Matches:
     * - var(--variable-name)
     * - --variable-name: value
     */
    static extractCssVariables(content: string): string[] {
        const variables = new Set<string>();

        // Match --variable-name
        const variableRegex = /--([a-zA-Z0-9_-]+)/g;
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            if (match[0].trim()) variables.add(match[0].trim());
        }

        return Array.from(variables);
    }


    /**
     * Extracts imported CSS files from the given content.
     * Matches typical import patterns like:
     * - import './style.css';
     * - import 'style.css';
     * - require('./style.css');
     */
    static extractImports(content: string): string[] {
        const imports = new Set<string>();

        // Regex for ES6 imports
        // import ... from '...' or import '...'
        const importRegex = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+\.css)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            if (match[1].trim()) imports.add(match[1].trim());
        }

        // Regex for require
        const requireRegex = /require\(['"]([^'"]+\.css)['"]\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            if (match[1].trim()) imports.add(match[1].trim());
        }

        return Array.from(imports);
    }
}

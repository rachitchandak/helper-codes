export { HtmlParser } from './HtmlParser';
export { JsxParser } from './JsxParser';
export { AndroidXmlParser } from './AndroidXmlParser';

import { HtmlParser } from './HtmlParser';
import { JsxParser } from './JsxParser';
import { AndroidXmlParser } from './AndroidXmlParser';
import { ParseResult } from '../types/ast';

export class StaticAstEngine {
    private htmlParser = new HtmlParser();
    private jsxParser = new JsxParser();
    private androidParser = new AndroidXmlParser();

    public parseFile(filePath: string, content: string): ParseResult {
        if (filePath.endsWith('.html') || filePath.endsWith('.vue') || filePath.endsWith('.ng.html')) {
            return this.htmlParser.parse(content, filePath);
        } else if (filePath.match(/\.(js|jsx|ts|tsx)$/)) {
            return this.jsxParser.parse(content, filePath);
        } else if (filePath.endsWith('.xml')) {
            return this.androidParser.parse(content, filePath);
        }

        return {
            file: filePath,
            framework: 'unknown',
            ast: [],
            errors: ['Unsupported file type']
        };
    }
}

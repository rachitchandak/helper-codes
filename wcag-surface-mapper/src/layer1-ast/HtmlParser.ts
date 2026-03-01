import * as parse5 from 'parse5';
import { SemanticNode, ParseResult } from '../types/ast';

export class HtmlParser {
    public parse(content: string, filename: string): ParseResult {
        const document = parse5.parse(content, { sourceCodeLocationInfo: true });
        const errors: string[] = [];
        const ast: SemanticNode[] = [];

        let idCounter = 0;

        const traverse = (node: any): SemanticNode | null => {
            // We only care about element nodes
            if (node.nodeName === '#text' || node.nodeName === '#comment' || node.nodeName === '#document' || node.nodeName.startsWith('?')) {
                // Special handle for root document or wrapper
                if (node.nodeName === '#document' && node.childNodes) {
                    for (const child of node.childNodes) {
                        const mapped = traverse(child);
                        if (mapped) ast.push(mapped);
                    }
                }
                return null;
            }

            const attributes: Record<string, string> = {};
            if (node.attrs) {
                node.attrs.forEach((attr: any) => {
                    attributes[attr.name] = attr.value;
                });
            }

            const events: string[] = [];
            for (const key of Object.keys(attributes)) {
                if (key.startsWith('on')) {
                    events.push(key);
                }
            }

            // Collect text
            let text = '';
            if (node.childNodes) {
                for (const child of node.childNodes) {
                    if (child.nodeName === '#text') {
                        text += child.value;
                    }
                }
            }

            const loc = node.sourceCodeLocation || { startLine: 0, startCol: 0, endLine: 0, endCol: 0 };

            const semanticNode: SemanticNode = {
                id: `html_${idCounter++}`,
                type: 'element',
                tag: node.tagName || node.nodeName,
                attributes,
                events,
                text: text.trim(),
                children: [],
                framework: 'html',
                loc: {
                    start: { line: loc.startLine, column: loc.startCol },
                    end: { line: loc.endLine, column: loc.endCol }
                }
            };

            if (node.childNodes) {
                for (const child of node.childNodes) {
                    const mappedChild = traverse(child);
                    if (mappedChild) {
                        mappedChild.parent = semanticNode;
                        semanticNode.children.push(mappedChild);
                    }
                }
            }

            return semanticNode;
        };

        try {
            traverse(document);
        } catch (e: any) {
            errors.push(`HTML Parse Error: ${e.message}`);
        }

        return {
            file: filename,
            framework: 'html',
            ast,
            errors
        };
    }
}

import { XMLParser } from 'fast-xml-parser';
import { SemanticNode, ParseResult } from '../types/ast';

export class AndroidXmlParser {
    public parse(content: string, filename: string): ParseResult {
        const errors: string[] = [];
        const ast: SemanticNode[] = [];
        let idCounter = 0;

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            preserveOrder: true
        });

        try {
            const parsedXml = parser.parse(content);

            const traverse = (nodes: any[]): SemanticNode[] => {
                const result: SemanticNode[] = [];

                for (const node of nodes) {
                    // A node looks like: { "LinearLayout": [ children ], ":@": { "@_android:layout_width": "match_parent" } }
                    const keys = Object.keys(node);
                    let tagKey = keys.find(k => k !== ':@' && k !== '#text');

                    if (!tagKey) continue; // might be text or something else

                    const tag = tagKey;
                    const children = Array.isArray(node[tag]) ? node[tag] : [];
                    const attrsSource = node[':@'] || {};

                    const attributes: Record<string, string> = {};
                    const events: string[] = [];

                    for (const [key, value] of Object.entries(attrsSource)) {
                        const cleanKey = key.replace('@_', '');
                        attributes[cleanKey] = String(value);

                        // In Android, onClick, onTouch, etc are attributes usually starting with android:onClick
                        if (cleanKey === 'android:onClick' || cleanKey === 'android:onItemClick') {
                            events.push(cleanKey);
                        }
                    }

                    // In fast-xml-parser with preserveOrder, text is represented as { "#text": "value" }
                    let text = '';
                    for (const child of children) {
                        if (child['#text']) {
                            text += child['#text'].trim() + ' ';
                        }
                    }

                    const semanticNode: SemanticNode = {
                        id: `android_${idCounter++}`,
                        type: tag.includes('.') ? 'custom_view' : 'view',
                        tag,
                        attributes,
                        events,
                        text: text.trim(),
                        children: [],
                        framework: 'android',
                        loc: {
                            start: { line: 0, column: 0 },
                            end: { line: 0, column: 0 } // fast-xml-parser doesn't provide loc by default
                        }
                    };

                    const childNodes = traverse(children);
                    for (const childNode of childNodes) {
                        childNode.parent = semanticNode;
                        semanticNode.children.push(childNode);
                    }

                    result.push(semanticNode);
                }

                return result;
            };

            ast.push(...traverse(parsedXml));

        } catch (e: any) {
            errors.push(`Android XML Parse Error: ${e.message}`);
        }

        return {
            file: filename,
            framework: 'android',
            ast,
            errors
        };
    }
}

import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { SemanticNode, ParseResult } from '../types/ast';

export class JsxParser {
    public parse(content: string, filename: string): ParseResult {
        const errors: string[] = [];
        const ast: SemanticNode[] = [];
        let idCounter = 0;

        try {
            const babelAst = babelParser.parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript'],
            });

            // We need a way to build a tree from flattening the traversal, or perform a manual tree walk.
            // Babel traverse does a deep traversal, so we can track parents using a stack.
            const nodeStack: SemanticNode[] = [];

            traverse(babelAst, {
                JSXElement: {
                    enter(path) {
                        const node = path.node;
                        const openingElement = node.openingElement;
                        let tag = 'unknown';

                        if (openingElement.name.type === 'JSXIdentifier') {
                            tag = openingElement.name.name;
                        } else if (openingElement.name.type === 'JSXMemberExpression') {
                            tag = `${(openingElement.name.object as any).name}.${openingElement.name.property.name}`;
                        }

                        const attributes: Record<string, string> = {};
                        const events: string[] = [];

                        openingElement.attributes.forEach((attr) => {
                            if (attr.type === 'JSXAttribute') {
                                const attrName = attr.name.name as string;
                                let attrValue = '';

                                if (attr.value) {
                                    if (attr.value.type === 'StringLiteral') {
                                        attrValue = attr.value.value;
                                    } else if (attr.value.type === 'JSXExpressionContainer') {
                                        // For expressions, we store a placeholder or try to extract literals
                                        attrValue = '{expression}';
                                    }
                                }

                                attributes[attrName] = attrValue;

                                if (attrName.startsWith('on') || attrName.match(/^[a-z]+On[A-Z]/)) {
                                    events.push(attrName);
                                }
                            }
                        });

                        // Extract text from immediate children that are JSXText
                        let text = '';
                        node.children.forEach(child => {
                            if (child.type === 'JSXText') {
                                text += child.value.trim() + ' ';
                            } else if (child.type === 'JSXExpressionContainer') {
                                // If the expression container wraps a string literal
                                if (child.expression.type === 'StringLiteral') {
                                    text += child.expression.value + ' ';
                                }
                            }
                        });

                        const loc = node.loc || { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };

                        const semanticNode: SemanticNode = {
                            id: `jsx_${idCounter++}`,
                            type: tag.match(/^[A-Z]/) ? 'component' : 'element',
                            tag,
                            attributes,
                            events,
                            text: text.trim(),
                            children: [],
                            framework: 'react',
                            loc: {
                                start: loc.start,
                                end: loc.end
                            }
                        };

                        if (nodeStack.length > 0) {
                            const parent = nodeStack[nodeStack.length - 1];
                            semanticNode.parent = parent;
                            parent.children.push(semanticNode);
                        } else {
                            ast.push(semanticNode);
                        }

                        nodeStack.push(semanticNode);
                    },
                    exit() {
                        nodeStack.pop();
                    }
                },
                JSXFragment: {
                    // You could track fragments to preserve tree structure if needed, but often not necessary for semantics natively
                }
            });
        } catch (e: any) {
            errors.push(`JSX Parser Error: ${e.message}`);
        }

        return {
            file: filename,
            framework: 'react',
            ast,
            errors
        };
    }
}

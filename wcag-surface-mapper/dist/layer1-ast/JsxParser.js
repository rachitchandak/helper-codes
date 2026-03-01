"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsxParser = void 0;
const babelParser = __importStar(require("@babel/parser"));
const traverse_1 = __importDefault(require("@babel/traverse"));
class JsxParser {
    parse(content, filename) {
        const errors = [];
        const ast = [];
        let idCounter = 0;
        try {
            const babelAst = babelParser.parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript'],
            });
            // We need a way to build a tree from flattening the traversal, or perform a manual tree walk.
            // Babel traverse does a deep traversal, so we can track parents using a stack.
            const nodeStack = [];
            (0, traverse_1.default)(babelAst, {
                JSXElement: {
                    enter(path) {
                        const node = path.node;
                        const openingElement = node.openingElement;
                        let tag = 'unknown';
                        if (openingElement.name.type === 'JSXIdentifier') {
                            tag = openingElement.name.name;
                        }
                        else if (openingElement.name.type === 'JSXMemberExpression') {
                            tag = `${openingElement.name.object.name}.${openingElement.name.property.name}`;
                        }
                        const attributes = {};
                        const events = [];
                        openingElement.attributes.forEach((attr) => {
                            if (attr.type === 'JSXAttribute') {
                                const attrName = attr.name.name;
                                let attrValue = '';
                                if (attr.value) {
                                    if (attr.value.type === 'StringLiteral') {
                                        attrValue = attr.value.value;
                                    }
                                    else if (attr.value.type === 'JSXExpressionContainer') {
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
                            }
                            else if (child.type === 'JSXExpressionContainer') {
                                // If the expression container wraps a string literal
                                if (child.expression.type === 'StringLiteral') {
                                    text += child.expression.value + ' ';
                                }
                            }
                        });
                        const loc = node.loc || { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
                        const semanticNode = {
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
                        }
                        else {
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
        }
        catch (e) {
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
exports.JsxParser = JsxParser;

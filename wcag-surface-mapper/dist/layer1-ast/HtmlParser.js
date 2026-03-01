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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlParser = void 0;
const parse5 = __importStar(require("parse5"));
class HtmlParser {
    parse(content, filename) {
        const document = parse5.parse(content, { sourceCodeLocationInfo: true });
        const errors = [];
        const ast = [];
        let idCounter = 0;
        const traverse = (node) => {
            // We only care about element nodes
            if (node.nodeName === '#text' || node.nodeName === '#comment' || node.nodeName === '#document' || node.nodeName.startsWith('?')) {
                // Special handle for root document or wrapper
                if (node.nodeName === '#document' && node.childNodes) {
                    for (const child of node.childNodes) {
                        const mapped = traverse(child);
                        if (mapped)
                            ast.push(mapped);
                    }
                }
                return null;
            }
            const attributes = {};
            if (node.attrs) {
                node.attrs.forEach((attr) => {
                    attributes[attr.name] = attr.value;
                });
            }
            const events = [];
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
            const semanticNode = {
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
        }
        catch (e) {
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
exports.HtmlParser = HtmlParser;

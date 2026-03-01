"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticAstEngine = exports.AndroidXmlParser = exports.JsxParser = exports.HtmlParser = void 0;
var HtmlParser_1 = require("./HtmlParser");
Object.defineProperty(exports, "HtmlParser", { enumerable: true, get: function () { return HtmlParser_1.HtmlParser; } });
var JsxParser_1 = require("./JsxParser");
Object.defineProperty(exports, "JsxParser", { enumerable: true, get: function () { return JsxParser_1.JsxParser; } });
var AndroidXmlParser_1 = require("./AndroidXmlParser");
Object.defineProperty(exports, "AndroidXmlParser", { enumerable: true, get: function () { return AndroidXmlParser_1.AndroidXmlParser; } });
const HtmlParser_2 = require("./HtmlParser");
const JsxParser_2 = require("./JsxParser");
const AndroidXmlParser_2 = require("./AndroidXmlParser");
class StaticAstEngine {
    htmlParser = new HtmlParser_2.HtmlParser();
    jsxParser = new JsxParser_2.JsxParser();
    androidParser = new AndroidXmlParser_2.AndroidXmlParser();
    parseFile(filePath, content) {
        if (filePath.endsWith('.html') || filePath.endsWith('.vue') || filePath.endsWith('.ng.html')) {
            return this.htmlParser.parse(content, filePath);
        }
        else if (filePath.match(/\.(js|jsx|ts|tsx)$/)) {
            return this.jsxParser.parse(content, filePath);
        }
        else if (filePath.endsWith('.xml')) {
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
exports.StaticAstEngine = StaticAstEngine;

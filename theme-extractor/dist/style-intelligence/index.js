"use strict";
/**
 * Style Intelligence Layer — Public API.
 *
 * Usage:
 *   import { extract } from 'style-intelligence';
 *   const context = await extract('/path/to/project');
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isResolvedColor = exports.isColorValue = exports.normalizeColor = exports.mapClasses = exports.flattenColors = exports.extractTailwindColors = exports.resolveVariables = exports.parseCssFiles = exports.scanFiles = exports.extract = void 0;
var ThemeExtractor_1 = require("./ThemeExtractor");
Object.defineProperty(exports, "extract", { enumerable: true, get: function () { return ThemeExtractor_1.extract; } });
var FileScanner_1 = require("./FileScanner");
Object.defineProperty(exports, "scanFiles", { enumerable: true, get: function () { return FileScanner_1.scanFiles; } });
var CssParser_1 = require("./CssParser");
Object.defineProperty(exports, "parseCssFiles", { enumerable: true, get: function () { return CssParser_1.parseCssFiles; } });
var VariableResolver_1 = require("./VariableResolver");
Object.defineProperty(exports, "resolveVariables", { enumerable: true, get: function () { return VariableResolver_1.resolveVariables; } });
var TailwindExtractor_1 = require("./TailwindExtractor");
Object.defineProperty(exports, "extractTailwindColors", { enumerable: true, get: function () { return TailwindExtractor_1.extractTailwindColors; } });
Object.defineProperty(exports, "flattenColors", { enumerable: true, get: function () { return TailwindExtractor_1.flattenColors; } });
var ClassMapper_1 = require("./ClassMapper");
Object.defineProperty(exports, "mapClasses", { enumerable: true, get: function () { return ClassMapper_1.mapClasses; } });
var ColorUtils_1 = require("./ColorUtils");
Object.defineProperty(exports, "normalizeColor", { enumerable: true, get: function () { return ColorUtils_1.normalizeColor; } });
Object.defineProperty(exports, "isColorValue", { enumerable: true, get: function () { return ColorUtils_1.isColorValue; } });
Object.defineProperty(exports, "isResolvedColor", { enumerable: true, get: function () { return ColorUtils_1.isResolvedColor; } });
//# sourceMappingURL=index.js.map
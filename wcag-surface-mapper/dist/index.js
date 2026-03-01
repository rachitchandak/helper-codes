#!/usr/bin/env node
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
exports.WcagSurfaceAnalyzer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const layer1_ast_1 = require("./layer1-ast");
const HeuristicEngine_1 = require("./layer2-semantics/HeuristicEngine");
const ScMappingEngine_1 = require("./layer4-mapping/ScMappingEngine");
const ReportingEngine_1 = require("./layer5-reporting/ReportingEngine");
class WcagSurfaceAnalyzer {
    astEngine = new layer1_ast_1.StaticAstEngine();
    heuristicEngine = new HeuristicEngine_1.SemanticHeuristicEngine();
    mappingEngine = new ScMappingEngine_1.ScMappingEngine();
    reportingEngine = new ReportingEngine_1.ReportingEngine();
    analyzeFile(filePath) {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found: ${absolutePath}`);
        }
        const content = fs.readFileSync(absolutePath, 'utf8');
        // Layer 1: Static AST Engine
        const astResult = this.astEngine.parseFile(absolutePath, content);
        // Layer 2: Semantic Heuristic Engine
        const classification = this.heuristicEngine.classify(astResult.file, astResult.framework, astResult.ast);
        // Layer 4: SC Mapping Engine
        const mappedData = this.mappingEngine.mapSurfaces(classification);
        // Layer 5: Reporting Engine
        const report = this.reportingEngine.generateReport(mappedData);
        return report;
    }
    analyzeProject(dirPath, outputDir) {
        const absolutePath = path.resolve(dirPath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Directory not found: ${absolutePath}`);
        }
        const allFiles = this.getAllFiles(absolutePath);
        const supportedFiles = allFiles.filter(f => f.match(/\.(html|vue|tsx?|jsx?|xml)$/));
        const outPath = path.resolve(outputDir);
        if (!fs.existsSync(outPath)) {
            fs.mkdirSync(outPath, { recursive: true });
        }
        const componentReport = {};
        console.log(`Starting analysis of ${supportedFiles.length} files...`);
        for (const file of supportedFiles) {
            try {
                const report = this.analyzeFile(file);
                // Output individual file report
                const relativePath = path.relative(absolutePath, file);
                const safeName = relativePath.replace(/[\/\\]/g, '_') + '.json';
                fs.writeFileSync(path.join(outPath, safeName), JSON.stringify(report, null, 2));
                // Aggregate project-level component report
                report.details.forEach(detail => {
                    if (detail.category) {
                        if (!componentReport[detail.category]) {
                            componentReport[detail.category] = { files: new Set(), sc: new Set() };
                        }
                        componentReport[detail.category].files.add(relativePath);
                        // Collect deduplicated WCAG guidelines for this specific component
                        if (Array.isArray(detail.sc)) {
                            detail.sc.forEach((scId) => componentReport[detail.category].sc.add(scId));
                        }
                    }
                });
            }
            catch (e) {
                console.error(`Failed to analyze ${file}: ${e.message}`);
            }
        }
        // Format final aggregated report
        const finalReport = {};
        for (const [component, data] of Object.entries(componentReport)) {
            finalReport[component] = {
                files: Array.from(data.files),
                wcag_guidelines: Array.from(data.sc).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            };
        }
        fs.writeFileSync(path.join(outPath, 'project-report.json'), JSON.stringify(finalReport, null, 2));
        console.log(`Analysis complete. Reports written to ${outPath}`);
    }
    getAllFiles(dirPath, arrayOfFiles = []) {
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                if (!['node_modules', 'dist', '.git', 'out'].includes(file)) {
                    arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
                }
            }
            else {
                arrayOfFiles.push(fullPath);
            }
        });
        return arrayOfFiles;
    }
}
exports.WcagSurfaceAnalyzer = WcagSurfaceAnalyzer;
// Simple CLI Runner
if (require.main === module) {
    const target = process.argv[2];
    const outputDir = process.argv[3] || './analysis_output';
    if (!target) {
        console.error('Usage: node index.js <path-to-file-or-dir> [output-dir]');
        process.exit(1);
    }
    const analyzer = new WcagSurfaceAnalyzer();
    const absoluteTarget = path.resolve(target);
    if (fs.statSync(absoluteTarget).isDirectory()) {
        analyzer.analyzeProject(absoluteTarget, outputDir);
    }
    else {
        const report = analyzer.analyzeFile(absoluteTarget);
        console.log(JSON.stringify(report, null, 2));
    }
}

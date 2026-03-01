#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { StaticAstEngine } from './layer1-ast';
import { SemanticHeuristicEngine } from './layer2-semantics/HeuristicEngine';
import { ScMappingEngine } from './layer4-mapping/ScMappingEngine';
import { ReportingEngine, FinalReportSchema } from './layer5-reporting/ReportingEngine';

export class WcagSurfaceAnalyzer {
    private astEngine = new StaticAstEngine();
    private heuristicEngine = new SemanticHeuristicEngine();
    private mappingEngine = new ScMappingEngine();
    private reportingEngine = new ReportingEngine();

    public analyzeFile(filePath: string): FinalReportSchema {
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

    public analyzeProject(dirPath: string, outputDir: string): void {
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

        const componentReport: Record<string, { files: Set<string>, sc: Set<string> }> = {};

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
                            detail.sc.forEach((scId: string) => componentReport[detail.category].sc.add(scId));
                        }
                    }
                });

            } catch (e: any) {
                console.error(`Failed to analyze ${file}: ${e.message}`);
            }
        }

        // Format final aggregated report
        const finalReport: any = {};
        for (const [component, data] of Object.entries(componentReport)) {
            finalReport[component] = {
                files: Array.from(data.files),
                wcag_guidelines: Array.from(data.sc).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            };
        }

        fs.writeFileSync(path.join(outPath, 'project-report.json'), JSON.stringify(finalReport, null, 2));
        console.log(`Analysis complete. Reports written to ${outPath}`);
    }

    private getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
        const files = fs.readdirSync(dirPath);

        files.forEach(file => {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                if (!['node_modules', 'dist', '.git', 'out'].includes(file)) {
                    arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
                }
            } else {
                arrayOfFiles.push(fullPath);
            }
        });

        return arrayOfFiles;
    }
}

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
    } else {
        const report = analyzer.analyzeFile(absoluteTarget);
        console.log(JSON.stringify(report, null, 2));
    }
}

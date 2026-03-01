"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportingEngine = void 0;
class ReportingEngine {
    generateReport(mappedData) {
        const surfacesSet = new Set();
        const potentialScSet = new Set();
        const requiresRuntimeSet = new Set();
        let totalConfidence = 0;
        mappedData.mappedSurfaces.forEach(surface => {
            surfacesSet.add(surface.category);
            totalConfidence += surface.confidence;
            surface.applicableSc.forEach(sc => {
                potentialScSet.add(sc.id);
                if (sc.requiresRuntime) {
                    requiresRuntimeSet.add(sc.id);
                }
            });
        });
        const averageConfidence = mappedData.mappedSurfaces.length > 0
            ? totalConfidence / mappedData.mappedSurfaces.length
            : 1; // 1 if no surfaces found
        return {
            file: mappedData.file,
            detected_surfaces: Array.from(surfacesSet),
            potential_wcag_sc: Array.from(potentialScSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
            requires_runtime_validation: Array.from(requiresRuntimeSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
            confidence_score: Math.round(averageConfidence * 100) / 100,
            details: mappedData.mappedSurfaces.map(s => ({
                category: s.category,
                element: s.node.tag,
                loc: s.node.loc,
                reasoning: s.reasoning,
                sc: s.applicableSc.map(sc => sc.id)
            }))
        };
    }
}
exports.ReportingEngine = ReportingEngine;

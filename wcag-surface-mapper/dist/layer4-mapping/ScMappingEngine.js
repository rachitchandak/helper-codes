"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScMappingEngine = void 0;
const sc_matrix_1 = require("../types/sc-matrix");
class ScMappingEngine {
    mapSurfaces(classification) {
        const mappedSurfaces = classification.surfaces.map(surface => {
            // Find all SCs that apply to this surface's category
            const applicableSc = sc_matrix_1.WCAG_2_2_MATRIX.filter(sc => sc.surfaces.includes(surface.category));
            return {
                ...surface,
                applicableSc
            };
        });
        return {
            file: classification.file,
            framework: classification.framework,
            mappedSurfaces
        };
    }
}
exports.ScMappingEngine = ScMappingEngine;

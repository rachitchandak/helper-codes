import { FileClassification, ClassifiedSurface } from '../types/surfaces';
import { WCAG_2_2_MATRIX, SuccessCriterion } from '../types/sc-matrix';

export interface MappedSurface extends ClassifiedSurface {
    applicableSc: SuccessCriterion[];
}

export interface MappedFileClassification {
    file: string;
    framework: string;
    mappedSurfaces: MappedSurface[];
}

export class ScMappingEngine {
    public mapSurfaces(classification: FileClassification): MappedFileClassification {
        const mappedSurfaces: MappedSurface[] = classification.surfaces.map(surface => {
            // Find all SCs that apply to this surface's category
            const applicableSc = WCAG_2_2_MATRIX.filter(sc =>
                sc.surfaces.includes(surface.category)
            );

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

import { SurfaceCategory, SemanticNode } from './ast';

export interface ClassifiedSurface {
    category: SurfaceCategory;
    node: SemanticNode;
    confidence: number; // 0 to 1
    reasoning: string;
}

export interface FileClassification {
    file: string;
    framework: string;
    surfaces: ClassifiedSurface[];
}

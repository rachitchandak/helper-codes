export type SurfaceCategory =
    | 'IMAGE_SURFACE'
    | 'INTERACTIVE_CONTROL_SURFACE'
    | 'FORM_INPUT_SURFACE'
    | 'MEDIA_SURFACE'
    | 'NAVIGATION_SURFACE'
    | 'STRUCTURE_SURFACE'
    | 'DYNAMIC_UPDATE_SURFACE'
    | 'PRESENTATION_SURFACE';

export interface SemanticNode {
    id: string; // unique identifier for the node within the file
    type: string; // e.g., 'element', 'component', 'text', 'style'
    tag: string; // e.g., 'div', 'button', 'ImageView', 'Image'
    attributes: Record<string, string>;
    events: string[]; // e.g., ['onClick', 'onKeyDown']
    text: string;
    children: SemanticNode[];
    parent?: SemanticNode; // Circular references should be handled with care
    framework: 'html' | 'react' | 'android' | 'css' | 'unknown';
    loc: {
        start: { line: number, column: number };
        end: { line: number, column: number };
    };
}

export interface ParseResult {
    file: string;
    framework: 'html' | 'react' | 'android' | 'css' | 'unknown';
    ast: SemanticNode[]; // Root nodes
    errors: string[];
}

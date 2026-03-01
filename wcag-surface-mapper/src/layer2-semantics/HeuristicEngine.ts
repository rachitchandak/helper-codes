import { SemanticNode } from '../types/ast';
import { ClassifiedSurface, FileClassification } from '../types/surfaces';

export class SemanticHeuristicEngine {
    public classify(file: string, framework: string, ast: SemanticNode[]): FileClassification {
        const surfaces: ClassifiedSurface[] = [];

        const traverse = (node: SemanticNode) => {
            // Apply rules to current node
            const nodeSurfaces = this.applyRules(node);
            surfaces.push(...nodeSurfaces);

            // Check children
            for (const child of node.children) {
                traverse(child);
            }
        };

        for (const root of ast) {
            traverse(root);
        }

        return {
            file,
            framework,
            surfaces
        };
    }

    private applyRules(node: SemanticNode): ClassifiedSurface[] {
        const classifications: ClassifiedSurface[] = [];
        const tag = node.tag.toLowerCase();
        const attrs = Object.keys(node.attributes).map(k => k.toLowerCase());
        const role = node.attributes['role']?.toLowerCase() || '';

        // 1️⃣ IMAGE_SURFACE
        if (
            ['img', 'picture', 'svg', 'canvas', 'image', 'imageview'].includes(tag) ||
            node.attributes['background-image'] ||
            role === 'img' ||
            role === 'graphics-document'
        ) {
            classifications.push({
                category: 'IMAGE_SURFACE',
                node,
                confidence: 0.9,
                reasoning: `Matched image tag or role: ${node.tag} | role: ${role}`
            });
        }

        // 2️⃣ INTERACTIVE_CONTROL_SURFACE
        const hasClick = node.events.some(e => e.toLowerCase().includes('click') || e.toLowerCase().includes('press'));
        const isInteractiveElement = ['button', 'a', 'summary', 'details'].includes(tag) && (tag !== 'a' || node.attributes['href']);
        const isInteractiveRole = ['button', 'link', 'menuitem', 'option', 'tab', 'switch', 'checkbox', 'radio'].includes(role);
        const isAndroidClickable = ['button', 'imagebutton', 'floatingactionbutton'].includes(tag) || node.attributes['android:clickable'] === 'true' || node.attributes['android:onClick'];

        if (isInteractiveElement || isInteractiveRole || hasClick || isAndroidClickable) {
            classifications.push({
                category: 'INTERACTIVE_CONTROL_SURFACE',
                node,
                confidence: hasClick && !isInteractiveElement && !isInteractiveRole ? 0.7 : 0.9, // custom div with onClick is lower confidence static
                reasoning: `Interactive signals detected: tag=${tag}, role=${role}, events=[${node.events.join(',')}]`
            });
        }

        // 3️⃣ FORM_INPUT_SURFACE
        const isFormElement = ['input', 'select', 'textarea', 'label', 'fieldset', 'legend', 'datalist', 'edittext', 'autocompletetextview'].includes(tag);
        if (isFormElement || role === 'textbox' || role === 'combobox' || role === 'searchbox') {
            classifications.push({
                category: 'FORM_INPUT_SURFACE',
                node,
                confidence: 0.95,
                reasoning: `Form control tag or role: ${tag} | role: ${role}`
            });
        }

        // 4️⃣ MEDIA_SURFACE
        const isMedia = ['video', 'audio', 'track', 'source', 'videoview'].includes(tag) || role === 'application'; // Custom player might be application
        if (isMedia || (tag === 'iframe' && (node.attributes['src']?.includes('youtube') || node.attributes['src']?.includes('vimeo')))) {
            classifications.push({
                category: 'MEDIA_SURFACE',
                node,
                confidence: isMedia ? 0.95 : 0.8,
                reasoning: `Media element or embedded iframe: ${tag}`
            });
        }

        // 5️⃣ NAVIGATION_SURFACE
        const isNav = ['nav', 'menu', 'link', 'routerlink', 'bottomnavigation', 'drawerlayout'].includes(tag) || role === 'navigation';
        if (isNav) {
            classifications.push({
                category: 'NAVIGATION_SURFACE',
                node,
                confidence: 0.9,
                reasoning: `Navigation landmark or component: ${tag} | role: ${role}`
            });
        }

        // 6️⃣ STRUCTURE_SURFACE
        const isStructural = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main', 'header', 'footer', 'section', 'article', 'aside'].includes(tag);
        if (isStructural || ['heading', 'banner', 'contentinfo', 'main', 'region'].includes(role)) {
            classifications.push({
                category: 'STRUCTURE_SURFACE',
                node,
                confidence: 0.9,
                reasoning: `Structural element or landmark: ${tag} | role: ${role}`
            });
        }

        // 7️⃣ DYNAMIC_UPDATE_SURFACE
        const isDynamic = attrs.some(a => a.startsWith('aria-live') || a === 'aria-atomic' || a === 'aria-relevant') ||
            role === 'alert' || role === 'status' || role === 'log' || role === 'marquee' || role === 'timer' ||
            tag === 'toast' || tag === 'snackbar' || node.attributes['dangerouslySetInnerHTML'];

        if (isDynamic) {
            classifications.push({
                category: 'DYNAMIC_UPDATE_SURFACE',
                node,
                confidence: 0.85,
                reasoning: `Dynamic update signal detected: tag=${tag}, role=${role}, attrs contains aria-live/dangerouslySetInnerHTML`
            });
        }

        // 8️⃣ PRESENTATION_SURFACE
        // Look for styles, color-related attributes, or animation elements
        const hasPresentationStyles = node.attributes['style'] || node.attributes['class'] || node.attributes['className'];
        const isPresentationElement = ['style', 'marquee', 'blink'].includes(tag);

        if (hasPresentationStyles || isPresentationElement || role === 'presentation' || role === 'none') {
            classifications.push({
                category: 'PRESENTATION_SURFACE',
                node,
                confidence: role === 'presentation' ? 0.9 : 0.6, // Classes might just be behavioral, so lower confidence
                reasoning: `Presentation details found: tag=${tag}, role=${role}, style/class=${!!hasPresentationStyles}`
            });
        }

        return classifications;
    }
}

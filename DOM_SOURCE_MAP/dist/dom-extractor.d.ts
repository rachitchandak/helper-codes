import { DOMMapping } from "./types";
/**
 * Launches Playwright, navigates to `targetUrl`, and returns an array of
 * DOM-to-source mappings for every element with a `data-source-loc` attribute.
 *
 * @param targetUrl - The fully-qualified URL of the running dev server.
 * @returns An array of {@link DOMMapping} objects.
 */
export declare function extractMappings(targetUrl: string): Promise<DOMMapping[]>;
//# sourceMappingURL=dom-extractor.d.ts.map
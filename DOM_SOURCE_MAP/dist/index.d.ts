import { DOMMapperConfig, DOMMapping } from "./types";
/**
 * The top-level orchestrator for DOM-to-Source mapping.
 *
 * @example
 * ```ts
 * import { DOMMapper } from "./index";
 *
 * const mapper = new DOMMapper({
 *   sourceDir: "/path/to/your/project/src",
 *   startCommand: "npm run dev",
 *   targetUrl: "http://localhost:3000",
 *   port: 3000,
 *   timeoutMs: 30_000,
 * });
 *
 * const mappings = await mapper.runMapping();
 * console.log(JSON.stringify(mappings, null, 2));
 * ```
 */
export declare class DOMMapper {
    private readonly config;
    constructor(config: DOMMapperConfig);
    /**
     * Executes the full DOM-to-Source mapping pipeline:
     *
     *  1. **Backup** the source directory.
     *  2. **Instrument** all JSX/TSX/HTML files with `data-source-loc` attributes.
     *  3. **Start** the user's dev server and wait for it to be ready.
     *  4. **Extract** DOM-to-source mappings via a headless browser.
     *  5. **Restore** the original source code (guaranteed).
     *  6. **Stop** the dev server (guaranteed).
     *
     * @returns An array of {@link DOMMapping} objects.
     */
    runMapping(): Promise<DOMMapping[]>;
}
export { DOMMapperConfig, DOMMapping, SourceLocation } from "./types";
//# sourceMappingURL=index.d.ts.map
// ============================================================================
// src/types.ts — Core type definitions for the DOM-to-Source mapping tool.
// ============================================================================

/**
 * Configuration for the DOMMapper pipeline.
 *
 * @property sourceDir      - Absolute path to the project's source directory
 *                            that contains .jsx/.tsx/.html files to instrument.
 * @property startCommand   - Shell command to start the dev server
 *                            (e.g. "npm run dev").
 * @property targetUrl      - Full URL the dev server serves on
 *                            (e.g. "http://localhost:3000").
 * @property port           - Port the dev server listens on
 *                            (used for readiness polling).
 * @property timeoutMs      - Max milliseconds to wait for the dev server
 *                            to become ready before aborting.
 */
export interface DOMMapperConfig {
  sourceDir: string;
  startCommand: string;
  targetUrl: string;
  port: number;
  timeoutMs: number;
}

/**
 * Pinpoints an element's declaration in the original source code.
 *
 * @property filePath - Absolute path to the source file.
 * @property line     - 1-based line number.
 * @property column   - 0-based column offset.
 */
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

/**
 * A single mapping entry that ties a rendered DOM element back to its
 * original source declaration.
 *
 * @property domSelector    - A unique CSS selector that targets the element
 *                            in the rendered page.
 * @property htmlSnippet    - The outer HTML of the element (truncated to keep
 *                            payloads manageable).
 * @property sourceLocation - Where the element was declared in source code.
 */
export interface DOMMapping {
  domSelector: string;
  htmlSnippet: string;
  sourceLocation: SourceLocation;
}

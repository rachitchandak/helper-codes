// ============================================================================
// src/index.ts — Main Orchestrator.
//
// The DOMMapper class ties all modules together into a single, clean pipeline:
//
//   Backup → Instrument → Start Server → Extract Mappings → Restore → Stop
//
// It exposes one public method — `runMapping()` — that executes the full
// pipeline and returns an array of DOMMapping objects.  A try/finally block
// guarantees that the user's source code is always restored and the dev
// server is always stopped, even if an error occurs mid-pipeline.
// ============================================================================

import * as path from "path";
import { DOMMapperConfig, DOMMapping } from "./types";
import { BackupManager } from "./fs-manager";
import { instrumentAllFiles } from "./instrumenter";
import { ServerRunner } from "./server-runner";
import { extractMappings } from "./dom-extractor";

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
export class DOMMapper {
  private readonly config: DOMMapperConfig;

  constructor(config: DOMMapperConfig) {
    this.config = {
      ...config,
      sourceDir: path.resolve(config.sourceDir),
    };
  }

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
  async runMapping(): Promise<DOMMapping[]> {
    const { sourceDir, startCommand, targetUrl, timeoutMs } = this.config;

    console.log("=".repeat(72));
    console.log("  DOM-to-Source Mapper — Starting Pipeline");
    console.log("=".repeat(72));
    console.log(`  Source directory : ${sourceDir}`);
    console.log(`  Start command    : ${startCommand}`);
    console.log(`  Target URL       : ${targetUrl}`);
    console.log(`  Timeout          : ${timeoutMs}ms`);
    console.log("=".repeat(72));

    const backupManager = new BackupManager(sourceDir);
    const serverRunner = new ServerRunner(
      startCommand,
      sourceDir,
      targetUrl,
      timeoutMs
    );

    let mappings: DOMMapping[] = [];

    try {
      // ---------------------------------------------------------------
      // Step 1: Backup
      // ---------------------------------------------------------------
      console.log("\n▶ Step 1/4 — Backing up source directory…");
      await backupManager.backup();

      // ---------------------------------------------------------------
      // Step 2: Instrument
      // ---------------------------------------------------------------
      console.log("\n▶ Step 2/4 — Instrumenting source files…");
      const count = await instrumentAllFiles(sourceDir);

      if (count === 0) {
        console.warn(
          "⚠ No files were instrumented.  The mapping will be empty."
        );
      }

      // ---------------------------------------------------------------
      // Step 3: Start dev server
      // ---------------------------------------------------------------
      console.log("\n▶ Step 3/4 — Starting dev server…");
      await serverRunner.start();

      // ---------------------------------------------------------------
      // Step 4: Extract mappings
      // ---------------------------------------------------------------
      console.log("\n▶ Step 4/4 — Extracting DOM-to-source mappings…");
      mappings = await extractMappings(targetUrl);
    } finally {
      // ---------------------------------------------------------------
      // Cleanup: Stop server first, THEN restore (guaranteed)
      // ---------------------------------------------------------------
      console.log("\n▶ Cleanup — Stopping server & restoring source…");

      // Stop the dev server FIRST so it releases file handles.
      try {
        await serverRunner.stop();
      } catch (stopErr) {
        console.error(
          "[orchestrator] Warning: Failed to stop dev server cleanly.",
          stopErr
        );
      }

      // Brief delay to let the OS fully release file handles (Windows).
      await new Promise((r) => setTimeout(r, 1_000));

      // Now restore the original source.
      try {
        await backupManager.restore();
      } catch (restoreErr) {
        console.error(
          "[orchestrator] CRITICAL: Failed to restore source!",
          restoreErr
        );
        console.error(
          `[orchestrator] Your backup may still exist at the .dom-mapper-backup directory.`
        );
      }
    }

    console.log("\n" + "=".repeat(72));
    console.log(`  Pipeline complete — ${mappings.length} mapping(s) found.`);
    console.log("=".repeat(72));

    return mappings;
  }
}

// --------------------------------------------------------------------------
// Re-export public types so consumers can import everything from one place.
// --------------------------------------------------------------------------
export { DOMMapperConfig, DOMMapping, SourceLocation } from "./types";

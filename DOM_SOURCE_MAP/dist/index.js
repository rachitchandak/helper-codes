"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOMMapper = void 0;
const path = __importStar(require("path"));
const fs_manager_1 = require("./fs-manager");
const instrumenter_1 = require("./instrumenter");
const server_runner_1 = require("./server-runner");
const dom_extractor_1 = require("./dom-extractor");
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
class DOMMapper {
    constructor(config) {
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
    async runMapping() {
        const { sourceDir, startCommand, targetUrl, timeoutMs } = this.config;
        console.log("=".repeat(72));
        console.log("  DOM-to-Source Mapper — Starting Pipeline");
        console.log("=".repeat(72));
        console.log(`  Source directory : ${sourceDir}`);
        console.log(`  Start command    : ${startCommand}`);
        console.log(`  Target URL       : ${targetUrl}`);
        console.log(`  Timeout          : ${timeoutMs}ms`);
        console.log("=".repeat(72));
        const backupManager = new fs_manager_1.BackupManager(sourceDir);
        const serverRunner = new server_runner_1.ServerRunner(startCommand, sourceDir, targetUrl, timeoutMs);
        let mappings = [];
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
            const count = await (0, instrumenter_1.instrumentAllFiles)(sourceDir);
            if (count === 0) {
                console.warn("⚠ No files were instrumented.  The mapping will be empty.");
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
            mappings = await (0, dom_extractor_1.extractMappings)(targetUrl);
        }
        finally {
            // ---------------------------------------------------------------
            // Cleanup: Stop server first, THEN restore (guaranteed)
            // ---------------------------------------------------------------
            console.log("\n▶ Cleanup — Stopping server & restoring source…");
            // Stop the dev server FIRST so it releases file handles.
            try {
                await serverRunner.stop();
            }
            catch (stopErr) {
                console.error("[orchestrator] Warning: Failed to stop dev server cleanly.", stopErr);
            }
            // Brief delay to let the OS fully release file handles (Windows).
            await new Promise((r) => setTimeout(r, 1000));
            // Now restore the original source.
            try {
                await backupManager.restore();
            }
            catch (restoreErr) {
                console.error("[orchestrator] CRITICAL: Failed to restore source!", restoreErr);
                console.error(`[orchestrator] Your backup may still exist at the .dom-mapper-backup directory.`);
            }
        }
        console.log("\n" + "=".repeat(72));
        console.log(`  Pipeline complete — ${mappings.length} mapping(s) found.`);
        console.log("=".repeat(72));
        return mappings;
    }
}
exports.DOMMapper = DOMMapper;
//# sourceMappingURL=index.js.map
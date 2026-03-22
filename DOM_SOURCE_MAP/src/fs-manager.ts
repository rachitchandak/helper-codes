// ============================================================================
// src/fs-manager.ts — Backup & Restore module.
//
// Provides a bulletproof mechanism to back up the user's source directory
// before instrumentation and restore it afterwards.  Registers process-level
// signal handlers so that the source code is ALWAYS restored, even if the
// pipeline crashes or the user hits Ctrl-C.
// ============================================================================

import * as fs from "fs";
import * as path from "path";

/**
 * Manages a recursive backup/restore cycle for a directory tree.
 *
 * Usage:
 *   const mgr = new BackupManager("/project/src");
 *   await mgr.backup();
 *   // … mutate files …
 *   await mgr.restore();   // guaranteed via signal handlers too
 */
export class BackupManager {
  /** Absolute path to the directory being protected. */
  private readonly sourceDir: string;

  /** Absolute path to the backup copy. */
  private readonly backupDir: string;

  /** Whether a backup currently exists on disk. */
  private hasBackup = false;

  /** Bound handler references so we can unregister them on cleanup. */
  private readonly boundRestore: () => void;

  constructor(sourceDir: string) {
    this.sourceDir = path.resolve(sourceDir);

    // Place the backup as a hidden sibling directory so it lives on the
    // same filesystem (avoids cross-device copy issues).
    this.backupDir = path.join(
      path.dirname(this.sourceDir),
      `.dom-mapper-backup_${path.basename(this.sourceDir)}`
    );

    // Pre-bind the emergency restore handler so we can both register
    // and unregister the exact same function reference.
    this.boundRestore = () => {
      this.restoreSync();
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Recursively copies `sourceDir` into the backup location and registers
   * process-level signal handlers to guarantee restoration.
   */
  async backup(): Promise<void> {
    console.log(`[fs-manager] Backing up: ${this.sourceDir}`);
    console.log(`[fs-manager]         to: ${this.backupDir}`);

    // Remove any stale backup from a previous failed run.
    if (fs.existsSync(this.backupDir)) {
      console.log("[fs-manager] Removing stale backup from a previous run…");
      await fs.promises.rm(this.backupDir, { recursive: true, force: true });
    }

    // Recursive copy (Node >= 16.7).
    await fs.promises.cp(this.sourceDir, this.backupDir, { recursive: true });
    this.hasBackup = true;

    // Register emergency handlers.
    process.on("SIGINT", this.boundRestore);
    process.on("SIGTERM", this.boundRestore);
    process.on("uncaughtException", this.boundRestore);

    console.log("[fs-manager] Backup created successfully.");
  }

  /**
   * Restores the source directory from the backup and removes the backup.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async restore(): Promise<void> {
    if (!this.hasBackup) {
      console.log("[fs-manager] No backup to restore (already restored or never created).");
      return;
    }

    console.log(`[fs-manager] Restoring source from backup…`);

    // Wipe the instrumented source tree.
    await fs.promises.rm(this.sourceDir, { recursive: true, force: true });

    // Move the backup back (rename is atomic on the same filesystem).
    await fs.promises.rename(this.backupDir, this.sourceDir);

    this.hasBackup = false;
    this.unregisterHandlers();

    console.log("[fs-manager] Source restored successfully.");
  }

  /**
   * Synchronous restore — used inside signal handlers where async is
   * not guaranteed to complete before the process exits.
   */
  restoreSync(): void {
    if (!this.hasBackup) return;

    try {
      console.log("[fs-manager] Emergency sync restore triggered!");
      fs.rmSync(this.sourceDir, { recursive: true, force: true });
      fs.renameSync(this.backupDir, this.sourceDir);
      this.hasBackup = false;
      this.unregisterHandlers();
      console.log("[fs-manager] Emergency restore complete.");
    } catch (err) {
      console.error("[fs-manager] CRITICAL: Emergency restore failed!", err);
    }
  }

  /** Returns whether a backup currently exists. */
  get isBackedUp(): boolean {
    return this.hasBackup;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /** Removes the process-level signal handlers to avoid memory leaks. */
  private unregisterHandlers(): void {
    process.removeListener("SIGINT", this.boundRestore);
    process.removeListener("SIGTERM", this.boundRestore);
    process.removeListener("uncaughtException", this.boundRestore);
  }
}

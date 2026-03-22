/**
 * Manages a recursive backup/restore cycle for a directory tree.
 *
 * Usage:
 *   const mgr = new BackupManager("/project/src");
 *   await mgr.backup();
 *   // … mutate files …
 *   await mgr.restore();   // guaranteed via signal handlers too
 */
export declare class BackupManager {
    /** Absolute path to the directory being protected. */
    private readonly sourceDir;
    /** Absolute path to the backup copy. */
    private readonly backupDir;
    /** Whether a backup currently exists on disk. */
    private hasBackup;
    /** Bound handler references so we can unregister them on cleanup. */
    private readonly boundRestore;
    constructor(sourceDir: string);
    /**
     * Recursively copies `sourceDir` into the backup location and registers
     * process-level signal handlers to guarantee restoration.
     */
    backup(): Promise<void>;
    /**
     * Restores the source directory from the backup and removes the backup.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    restore(): Promise<void>;
    /**
     * Synchronous restore — used inside signal handlers where async is
     * not guaranteed to complete before the process exits.
     */
    restoreSync(): void;
    /** Returns whether a backup currently exists. */
    get isBackedUp(): boolean;
    /** Removes the process-level signal handlers to avoid memory leaks. */
    private unregisterHandlers;
}
//# sourceMappingURL=fs-manager.d.ts.map
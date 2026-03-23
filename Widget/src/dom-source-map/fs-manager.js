import fs from 'node:fs';
import path from 'node:path';
import { glob, globSync } from 'glob';

const RESTORE_PATTERNS = ['**/*.js', '**/*.jsx', '**/*.tsx', '**/*.html'];
const RESTORE_IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.*/'];

export class BackupManager {
  constructor(sourceDir) {
    this.sourceDir = path.resolve(sourceDir);
    this.backupDir = path.join(
      path.dirname(this.sourceDir),
      `.dom-mapper-backup_${path.basename(this.sourceDir)}`,
    );
    this.hasBackup = false;
    this.backupManifest = [];
    this.boundRestore = () => {
      this.restoreSync();
    };
  }

  async backup() {
    console.log(`[fs-manager] Backing up: ${this.sourceDir}`);
    console.log(`[fs-manager]         to: ${this.backupDir}`);

    if (fs.existsSync(this.backupDir)) {
      console.log('[fs-manager] Removing stale backup from a previous run...');
      await fs.promises.rm(this.backupDir, { recursive: true, force: true });
    }

  this.backupManifest = await this.collectRestorableFiles(this.sourceDir);
  await fs.promises.cp(this.sourceDir, this.backupDir, { recursive: true });
    this.hasBackup = true;

    process.on('SIGINT', this.boundRestore);
    process.on('SIGTERM', this.boundRestore);
    process.on('uncaughtException', this.boundRestore);

    console.log('[fs-manager] Backup created successfully.');
  }

  async restore() {
    if (!this.hasBackup) {
      console.log('[fs-manager] No backup to restore (already restored or never created).');
      return;
    }

    console.log('[fs-manager] Restoring source from backup...');
    try {
      await fs.promises.rm(this.sourceDir, { recursive: true, force: true });
      await fs.promises.rename(this.backupDir, this.sourceDir);
    } catch (error) {
      if (!this.shouldUseFileRestoreFallback(error)) {
        throw error;
      }

      console.warn('[fs-manager] Directory swap restore failed; falling back to file-level restore.');
      await this.restoreFilesFromBackup();
    }

    this.hasBackup = false;
    this.backupManifest = [];
    this.unregisterHandlers();

    console.log('[fs-manager] Source restored successfully.');
  }

  restoreSync() {
    if (!this.hasBackup) {
      return;
    }

    try {
      console.log('[fs-manager] Emergency sync restore triggered!');
      fs.rmSync(this.sourceDir, { recursive: true, force: true });
      fs.renameSync(this.backupDir, this.sourceDir);
      this.hasBackup = false;
      this.backupManifest = [];
      this.unregisterHandlers();
      console.log('[fs-manager] Emergency restore complete.');
    } catch (error) {
      if (this.shouldUseFileRestoreFallback(error)) {
        try {
          console.warn('[fs-manager] Emergency directory swap failed; falling back to sync file restore.');
          this.restoreFilesFromBackupSync();
          this.hasBackup = false;
          this.backupManifest = [];
          this.unregisterHandlers();
          console.log('[fs-manager] Emergency file-level restore complete.');
          return;
        } catch (fallbackError) {
          console.error('[fs-manager] CRITICAL: Emergency file-level restore failed!', fallbackError);
        }
      }

      console.error('[fs-manager] CRITICAL: Emergency restore failed!', error);
    }
  }

  async collectRestorableFiles(baseDir) {
    const files = [];

    for (const pattern of RESTORE_PATTERNS) {
      const matches = await glob(pattern, {
        cwd: baseDir,
        nodir: true,
        ignore: RESTORE_IGNORE,
      });
      files.push(...matches);
    }

    return [...new Set(files)].sort();
  }

  collectRestorableFilesSync(baseDir) {
    const files = [];

    for (const pattern of RESTORE_PATTERNS) {
      const matches = globSync(pattern, {
        cwd: baseDir,
        nodir: true,
        ignore: RESTORE_IGNORE,
      });
      files.push(...matches);
    }

    return [...new Set(files)].sort();
  }

  shouldUseFileRestoreFallback(error) {
    return ['EBUSY', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error?.code);
  }

  async restoreFilesFromBackup() {
    const manifest = this.backupManifest.length
      ? this.backupManifest
      : await this.collectRestorableFiles(this.backupDir);

    for (const relativePath of manifest) {
      const sourcePath = path.join(this.backupDir, relativePath);
      const destinationPath = path.join(this.sourceDir, relativePath);
      await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.promises.copyFile(sourcePath, destinationPath);
    }

    await this.removeBackupDir();
  }

  restoreFilesFromBackupSync() {
    const manifest = this.backupManifest.length
      ? this.backupManifest
      : this.collectRestorableFilesSync(this.backupDir);

    for (const relativePath of manifest) {
      const sourcePath = path.join(this.backupDir, relativePath);
      const destinationPath = path.join(this.sourceDir, relativePath);
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }

    this.removeBackupDirSync();
  }

  async removeBackupDir() {
    try {
      await fs.promises.rm(this.backupDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[fs-manager] Restored files but could not remove backup directory ${this.backupDir}: ${error.message}`);
    }
  }

  removeBackupDirSync() {
    try {
      fs.rmSync(this.backupDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[fs-manager] Restored files but could not remove backup directory ${this.backupDir}: ${error.message}`);
    }
  }

  unregisterHandlers() {
    process.removeListener('SIGINT', this.boundRestore);
    process.removeListener('SIGTERM', this.boundRestore);
    process.removeListener('uncaughtException', this.boundRestore);
  }

  get isBackedUp() {
    return this.hasBackup;
  }
}
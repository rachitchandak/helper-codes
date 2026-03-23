import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

const POLL_INTERVAL_MS = 1_000;

export class ServerRunner {
  constructor(command, cwd, targetUrl, timeoutMs) {
    this.command = command;
    this.cwd = cwd;
    this.targetUrl = targetUrl;
    this.timeoutMs = timeoutMs;
    this.process = null;
    this.processError = null;
  }

  async start() {
    console.log(`[server-runner] Starting: ${this.command}`);
    console.log(`[server-runner]      cwd: ${this.cwd}`);

    const existingServer = await this.probe();
    if (existingServer.ready) {
      throw new Error(
        `[server-runner] ${this.targetUrl} was already responding with HTTP ${existingServer.statusCode} before launch. ` +
        'Refusing to attach to an existing server; stop it first or rerun with --skip-server.',
      );
    }

    const isWindows = process.platform === 'win32';

    this.process = spawn(this.command, {
      cwd: this.cwd,
      shell: true,
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      process.stdout.write(`[dev-server] ${data.toString()}`);
    });

    this.process.stderr?.on('data', (data) => {
      process.stderr.write(`[dev-server] ${data.toString()}`);
    });

    this.process.on('error', (error) => {
      this.processError = error;
      console.error(`[server-runner] Process error: ${error.message}`);
    });

    this.process.on('exit', (code) => {
      console.log(`[server-runner] Process exited with code ${code}`);
    });

    await this.waitForReady();
  }

  async stop() {
    if (!this.process || this.process.killed) {
      console.log('[server-runner] No running process to stop.');
      return;
    }

    console.log('[server-runner] Stopping dev server...');

    return new Promise((resolve) => {
      const proc = this.process;
      const killTimer = setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
          } else {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch {
          // Ignore shutdown races.
        }
        resolve();
      }, 5_000);

      proc.on('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });

      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          process.kill(-proc.pid, 'SIGTERM');
        }
      } catch {
        clearTimeout(killTimer);
        resolve();
      }
    });
  }

  async waitForReady() {
    console.log(`[server-runner] Waiting for ${this.targetUrl} to respond (timeout: ${this.timeoutMs}ms)...`);
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      if (this.processError) {
        throw new Error(`[server-runner] Failed to start process: ${this.processError.message}`);
      }

      if (this.process && this.process.exitCode !== null) {
        throw new Error(`[server-runner] Process exited before ${this.targetUrl} became ready (exit code ${this.process.exitCode}).`);
      }

      const probe = await this.probe();
      if (probe.ready) {
        console.log(`[server-runner] Server is ready (HTTP ${probe.statusCode}).`);
        return;
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`[server-runner] Server at ${this.targetUrl} did not become ready within ${this.timeoutMs}ms.`);
  }

  probe() {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(this.targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(this.targetUrl, (res) => {
          res.resume();
          const statusCode = res.statusCode ?? 0;
          resolve({
            ready: statusCode >= 200 && statusCode < 400,
            statusCode,
          });
        });

        req.on('error', () => resolve({ ready: false, statusCode: 0 }));
        req.setTimeout(3_000, () => {
          req.destroy();
          resolve({ ready: false, statusCode: 0 });
        });
      } catch {
        resolve({ ready: false, statusCode: 0 });
      }
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
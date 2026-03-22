// ============================================================================
// src/server-runner.ts — Process & Server Management.
//
// Spawns the user's dev-server command as a child process, then polls the
// target URL until it returns HTTP 200, confirming the server is ready to
// serve pages for Playwright to capture.
// ============================================================================

import { ChildProcess, spawn } from "child_process";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

/** Default interval between readiness polls (ms). */
const POLL_INTERVAL_MS = 1_000;

/**
 * Manages the lifecycle of the user's development server.
 *
 * Usage:
 *   const runner = new ServerRunner("npm run dev", "/project/src", "http://localhost:3000", 30_000);
 *   await runner.start();         // spawns + waits for 200 OK
 *   // … do work …
 *   await runner.stop();          // kills the process tree
 */
export class ServerRunner {
  private readonly command: string;
  private readonly cwd: string;
  private readonly targetUrl: string;
  private readonly timeoutMs: number;

  private process: ChildProcess | null = null;

  /**
   * @param command   - Shell command to start the dev server.
   * @param cwd       - Working directory in which to run the command.
   * @param targetUrl - URL to poll for readiness (e.g. "http://localhost:3000").
   * @param timeoutMs - Maximum time to wait for the server to become ready.
   */
  constructor(
    command: string,
    cwd: string,
    targetUrl: string,
    timeoutMs: number
  ) {
    this.command = command;
    this.cwd = cwd;
    this.targetUrl = targetUrl;
    this.timeoutMs = timeoutMs;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Spawns the dev-server process and waits until the target URL responds
   * with HTTP 200.
   *
   * @throws If the server does not become ready within `timeoutMs`.
   */
  async start(): Promise<void> {
    console.log(`[server-runner] Starting: ${this.command}`);
    console.log(`[server-runner]      cwd: ${this.cwd}`);

    // Determine the correct shell for the current platform.
    const isWindows = process.platform === "win32";

    this.process = spawn(this.command, {
      cwd: this.cwd,
      shell: true,
      // Use detached on non-Windows so we can kill the entire process group.
      detached: !isWindows,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Pipe server stdout/stderr through our own console for visibility.
    this.process.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(`[dev-server] ${data.toString()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[dev-server] ${data.toString()}`);
    });

    this.process.on("error", (err) => {
      console.error(`[server-runner] Process error: ${err.message}`);
    });

    this.process.on("exit", (code) => {
      console.log(`[server-runner] Process exited with code ${code}`);
    });

    // Wait for the server to respond with 200 OK.
    await this.waitForReady();
  }

  /**
   * Stops the dev-server process.  Attempts a graceful SIGTERM first, then
   * falls back to SIGKILL after a short grace period.
   */
  async stop(): Promise<void> {
    if (!this.process || this.process.killed) {
      console.log("[server-runner] No running process to stop.");
      return;
    }

    console.log("[server-runner] Stopping dev server…");

    return new Promise<void>((resolve) => {
      const proc = this.process!;

      // Give the process 5 seconds to shut down gracefully.
      const killTimer = setTimeout(() => {
        try {
          if (process.platform === "win32") {
            // On Windows, use taskkill to kill the process tree.
            spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
              stdio: "ignore",
            });
          } else {
            // On Unix, kill the process group.
            process.kill(-proc.pid!, "SIGKILL");
          }
        } catch {
          // Process may have already exited — ignore.
        }
        resolve();
      }, 5_000);

      proc.on("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });

      // Send initial termination signal.
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } else {
          process.kill(-proc.pid!, "SIGTERM");
        }
      } catch {
        // Process may have already exited.
        clearTimeout(killTimer);
        resolve();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /**
   * Polls `targetUrl` with simple HTTP GET requests until a 200 response
   * is received or the timeout is exceeded.
   */
  private async waitForReady(): Promise<void> {
    console.log(
      `[server-runner] Waiting for ${this.targetUrl} to respond (timeout: ${this.timeoutMs}ms)…`
    );

    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const isReady = await this.probe();
      if (isReady) {
        console.log("[server-runner] ✓ Server is ready!");
        return;
      }

      // Wait before retrying.
      await sleep(POLL_INTERVAL_MS);
    }

    // If we reach here the server never responded in time.
    throw new Error(
      `[server-runner] Server at ${this.targetUrl} did not become ready within ${this.timeoutMs}ms.`
    );
  }

  /**
   * Makes a single HTTP(S) GET request to `targetUrl`.
   * @returns `true` if the response status is 200, `false` otherwise.
   */
  private probe(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        const parsed = new URL(this.targetUrl);
        const client = parsed.protocol === "https:" ? https : http;

        const req = client.get(this.targetUrl, (res) => {
          // Drain the response body to free up the socket.
          res.resume();
          resolve(res.statusCode === 200);
        });

        req.on("error", () => resolve(false));

        // Abort the request if it takes too long.
        req.setTimeout(3_000, () => {
          req.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

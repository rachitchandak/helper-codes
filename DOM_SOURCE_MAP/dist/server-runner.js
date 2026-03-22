"use strict";
// ============================================================================
// src/server-runner.ts — Process & Server Management.
//
// Spawns the user's dev-server command as a child process, then polls the
// target URL until it returns HTTP 200, confirming the server is ready to
// serve pages for Playwright to capture.
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
exports.ServerRunner = void 0;
const child_process_1 = require("child_process");
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
/** Default interval between readiness polls (ms). */
const POLL_INTERVAL_MS = 1000;
/**
 * Manages the lifecycle of the user's development server.
 *
 * Usage:
 *   const runner = new ServerRunner("npm run dev", "/project/src", "http://localhost:3000", 30_000);
 *   await runner.start();         // spawns + waits for 200 OK
 *   // … do work …
 *   await runner.stop();          // kills the process tree
 */
class ServerRunner {
    /**
     * @param command   - Shell command to start the dev server.
     * @param cwd       - Working directory in which to run the command.
     * @param targetUrl - URL to poll for readiness (e.g. "http://localhost:3000").
     * @param timeoutMs - Maximum time to wait for the server to become ready.
     */
    constructor(command, cwd, targetUrl, timeoutMs) {
        this.process = null;
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
    async start() {
        console.log(`[server-runner] Starting: ${this.command}`);
        console.log(`[server-runner]      cwd: ${this.cwd}`);
        // Determine the correct shell for the current platform.
        const isWindows = process.platform === "win32";
        this.process = (0, child_process_1.spawn)(this.command, {
            cwd: this.cwd,
            shell: true,
            // Use detached on non-Windows so we can kill the entire process group.
            detached: !isWindows,
            stdio: ["ignore", "pipe", "pipe"],
        });
        // Pipe server stdout/stderr through our own console for visibility.
        this.process.stdout?.on("data", (data) => {
            process.stdout.write(`[dev-server] ${data.toString()}`);
        });
        this.process.stderr?.on("data", (data) => {
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
    async stop() {
        if (!this.process || this.process.killed) {
            console.log("[server-runner] No running process to stop.");
            return;
        }
        console.log("[server-runner] Stopping dev server…");
        return new Promise((resolve) => {
            const proc = this.process;
            // Give the process 5 seconds to shut down gracefully.
            const killTimer = setTimeout(() => {
                try {
                    if (process.platform === "win32") {
                        // On Windows, use taskkill to kill the process tree.
                        (0, child_process_1.spawn)("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
                            stdio: "ignore",
                        });
                    }
                    else {
                        // On Unix, kill the process group.
                        process.kill(-proc.pid, "SIGKILL");
                    }
                }
                catch {
                    // Process may have already exited — ignore.
                }
                resolve();
            }, 5000);
            proc.on("exit", () => {
                clearTimeout(killTimer);
                resolve();
            });
            // Send initial termination signal.
            try {
                if (process.platform === "win32") {
                    (0, child_process_1.spawn)("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
                        stdio: "ignore",
                    });
                }
                else {
                    process.kill(-proc.pid, "SIGTERM");
                }
            }
            catch {
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
    async waitForReady() {
        console.log(`[server-runner] Waiting for ${this.targetUrl} to respond (timeout: ${this.timeoutMs}ms)…`);
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
        throw new Error(`[server-runner] Server at ${this.targetUrl} did not become ready within ${this.timeoutMs}ms.`);
    }
    /**
     * Makes a single HTTP(S) GET request to `targetUrl`.
     * @returns `true` if the response status is 200, `false` otherwise.
     */
    probe() {
        return new Promise((resolve) => {
            try {
                const parsed = new url_1.URL(this.targetUrl);
                const client = parsed.protocol === "https:" ? https : http;
                const req = client.get(this.targetUrl, (res) => {
                    // Drain the response body to free up the socket.
                    res.resume();
                    resolve(res.statusCode === 200);
                });
                req.on("error", () => resolve(false));
                // Abort the request if it takes too long.
                req.setTimeout(3000, () => {
                    req.destroy();
                    resolve(false);
                });
            }
            catch {
                resolve(false);
            }
        });
    }
}
exports.ServerRunner = ServerRunner;
// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=server-runner.js.map
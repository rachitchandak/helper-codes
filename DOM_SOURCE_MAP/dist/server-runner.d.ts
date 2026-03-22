/**
 * Manages the lifecycle of the user's development server.
 *
 * Usage:
 *   const runner = new ServerRunner("npm run dev", "/project/src", "http://localhost:3000", 30_000);
 *   await runner.start();         // spawns + waits for 200 OK
 *   // … do work …
 *   await runner.stop();          // kills the process tree
 */
export declare class ServerRunner {
    private readonly command;
    private readonly cwd;
    private readonly targetUrl;
    private readonly timeoutMs;
    private process;
    /**
     * @param command   - Shell command to start the dev server.
     * @param cwd       - Working directory in which to run the command.
     * @param targetUrl - URL to poll for readiness (e.g. "http://localhost:3000").
     * @param timeoutMs - Maximum time to wait for the server to become ready.
     */
    constructor(command: string, cwd: string, targetUrl: string, timeoutMs: number);
    /**
     * Spawns the dev-server process and waits until the target URL responds
     * with HTTP 200.
     *
     * @throws If the server does not become ready within `timeoutMs`.
     */
    start(): Promise<void>;
    /**
     * Stops the dev-server process.  Attempts a graceful SIGTERM first, then
     * falls back to SIGKILL after a short grace period.
     */
    stop(): Promise<void>;
    /**
     * Polls `targetUrl` with simple HTTP GET requests until a 200 response
     * is received or the timeout is exceeded.
     */
    private waitForReady;
    /**
     * Makes a single HTTP(S) GET request to `targetUrl`.
     * @returns `true` if the response status is 200, `false` otherwise.
     */
    private probe;
}
//# sourceMappingURL=server-runner.d.ts.map
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface StartPocketIcServerOptions {
  binPath: string;
  ttl?: number;
  showRuntimeLogs?: boolean;
  showCanisterLogs?: boolean;
}

export class MopsPocketIcServer {
  readonly serverProcess: ChildProcessWithoutNullStreams;
  private readonly url: string;
  private readonly tempDir: string;

  private constructor(
    serverProcess: ChildProcessWithoutNullStreams,
    port: number,
    tempDir: string,
  ) {
    this.serverProcess = serverProcess;
    this.url = `http://127.0.0.1:${port}`;
    this.tempDir = tempDir;
  }

  static async start({
    binPath,
    ttl = 60,
    showRuntimeLogs = false,
    showCanisterLogs = false,
  }: StartPocketIcServerOptions): Promise<MopsPocketIcServer> {
    if (!existsSync(binPath)) {
      throw new Error(`PocketIC binary not found at ${binPath}`);
    }

    const tempDir = mkdtempSync(join(tmpdir(), "mops-pocket-ic-"));
    const portFile = join(tempDir, "pocket-ic.port");
    const serverProcess = spawn(
      binPath,
      ["--port-file", portFile, "--ttl", ttl.toString()],
      { stdio: "pipe" },
    );

    if (showRuntimeLogs) {
      serverProcess.stdout.pipe(process.stdout);
    } else {
      serverProcess.stdout.resume();
    }
    if (showCanisterLogs) {
      serverProcess.stderr.pipe(process.stderr);
    } else {
      serverProcess.stderr.resume();
    }

    let spawnError: Error | undefined;
    serverProcess.once("error", (error) => {
      spawnError = error;
    });

    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (spawnError) {
          throw spawnError;
        }
        if (serverProcess.exitCode !== null) {
          throw new Error(
            `PocketIC exited before startup with code ${serverProcess.exitCode}`,
          );
        }
        if (existsSync(portFile)) {
          const port = Number.parseInt(readFileSync(portFile, "utf8"), 10);
          if (Number.isInteger(port)) {
            return new MopsPocketIcServer(serverProcess, port, tempDir);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for PocketIC to start");
    } catch (error) {
      serverProcess.kill();
      rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  getUrl(): string {
    return this.url;
  }

  async stop(): Promise<void> {
    try {
      if (this.serverProcess.exitCode === null) {
        await new Promise<void>((resolve, reject) => {
          this.serverProcess.once("exit", () => resolve());
          this.serverProcess.once("error", reject);
          this.serverProcess.kill();
        });
      }
    } finally {
      rmSync(this.tempDir, { recursive: true, force: true });
    }
  }
}

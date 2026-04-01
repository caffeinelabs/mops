import process from "node:process";
import {
  ChildProcessWithoutNullStreams,
  execSync,
  spawn,
} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { PassThrough } from "node:stream";
import { spawn as spawnAsync } from "promisify-child-process";

import { IDL } from "@icp-sdk/core/candid";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import chalk from "chalk";

import {
  type AnyPocketIcServer,
  type AnyPocketIc,
  type AnySetupCanister,
  startPocketIc,
} from "../helpers/pocket-ic-client.js";
import { toolchain } from "./toolchain/index.js";
import { getDfxVersion } from "../helpers/get-dfx-version.js";
type StartOptions = {
  type?: "dfx" | "pocket-ic" | "dfx-pocket-ic";
  dir?: string;
  verbose?: boolean;
  silent?: boolean;
};

export class Replica {
  type: "dfx" | "pocket-ic" | "dfx-pocket-ic" = "dfx";
  verbose = false;
  canisters: Record<
    string,
    { cwd: string; canisterId: string; actor: any; stream: PassThrough }
  > = {};
  pocketIcServer?: AnyPocketIcServer;
  pocketIc?: AnyPocketIc;
  dfxProcess?: ChildProcessWithoutNullStreams;
  dir: string = ""; // absolute path (/.../.mops/.test/)
  ttl = 60;

  async start({ type, dir, verbose, silent }: StartOptions = {}) {
    this.type = type ?? this.type;
    this.verbose = verbose ?? this.verbose;
    this.dir = dir ?? this.dir;

    silent || console.log(`Starting ${this.type} replica...`);

    if (this.type === "dfx" || this.type === "dfx-pocket-ic") {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(
        path.join(this.dir, "dfx.json"),
        JSON.stringify(this.dfxJson(""), null, 2),
      );
      fs.writeFileSync(
        path.join(this.dir, "canister.did"),
        "service : { runTests: () -> (); }",
      );

      await this.stop();

      this.dfxProcess = spawn(
        "dfx",
        [
          "start",
          this.type === "dfx-pocket-ic" ? "--pocketic" : "",
          "--clean",
          this.verbose ? "" : "-qqqq",
          "--artificial-delay",
          "0",
        ]
          .filter((x) => x)
          .flat(),
        { cwd: this.dir },
      );

      // process canister logs
      this._attachCanisterLogHandler(this.dfxProcess);

      this.dfxProcess.stdout.on("data", (data) => {
        if (this.verbose) {
          console.log("DFX:", data.toString());
        }
      });

      this.dfxProcess.stderr.on("data", (data) => {
        if (this.verbose) {
          console.error("DFX:", data.toString());
        }
        if (data.toString().includes("Failed to bind socket to")) {
          console.error(chalk.red(data.toString()));
          console.log("Please try again after some time");
          // eslint-disable-next-line no-restricted-properties
          process.exit(11);
        }
      });

      // await for dfx to start
      let ok = false;
      while (!ok) {
        await fetch("http://127.0.0.1:4945/api/v2/status")
          .then((res) => {
            if (res.status === 200) {
              ok = true;
            }
          })
          .catch(() => {})
          .finally(() => {
            return new Promise((resolve) => setTimeout(resolve, 1000));
          });
      }
    } else {
      let pocketIcBin = await toolchain.bin("pocket-ic");

      let pic = await startPocketIc({
        binPath: pocketIcBin,
        showRuntimeLogs: false,
        showCanisterLogs: false,
        ttl: this.ttl,
      });
      this.pocketIcServer = pic.server;
      this.pocketIc = pic.client;

      // process canister logs
      this._attachCanisterLogHandler(
        this.pocketIcServer.serverProcess as ChildProcessWithoutNullStreams,
      );
    }
  }

  _attachCanisterLogHandler(proc: ChildProcessWithoutNullStreams) {
    let curData = "";
    proc.stderr.on("data", (data) => {
      curData = curData + data.toString();

      if (curData.includes("\n")) {
        let chunk = curData.split("\n").slice(0, -1).join("\n");
        let matches = [...chunk.matchAll(/\[Canister ([a-z0-9-]+)\] (.*)/g)];

        for (let match of matches) {
          let [, canisterId, msg] = match;
          let stream = this.getCanisterStream(canisterId || "");
          if (stream) {
            stream.write(msg);
          }
        }

        if (matches.length) {
          curData = curData.split("\n").slice(-1).join("\n");
        }
      }
    });
  }

  async stop(sigint = false) {
    if (this.type === "dfx" || this.type === "dfx-pocket-ic") {
      if (this.dfxProcess) {
        let killed = this.dfxProcess.kill();

        if (!killed) {
          this.dfxProcess.kill("SIGKILL");
        }

        // give replica some time to stop
        let i = 0;
        while (this.dfxProcess.exitCode === null) {
          i++;
          await new Promise((resolve) => {
            setTimeout(resolve, 500);
          });
          if (i >= 20) {
            break;
          }
        }

        // // make sure replica is stopped
        // try {
        // 	// execSync('dfx killall', {cwd: this.dir, timeout: 3_000, stdio: ['pipe', this.verbose ? 'inherit' : 'ignore', 'pipe']});
        // 	execSync('dfx stop' + (this.verbose ? '' : ' -qqqq'), {cwd: this.dir, timeout: 3_000, stdio: ['pipe', this.verbose ? 'inherit' : 'ignore', 'pipe']});
        // }
        // catch {}
      }
    } else if (this.pocketIc && this.pocketIcServer) {
      if (!sigint) {
        await this.pocketIc.tearDown(); // error 'fetch failed' if run on SIGINT
      }
      await this.pocketIcServer.stop();
    }
  }

  async deploy(
    name: string,
    wasm: string,
    idlFactory: IDL.InterfaceFactory,
    cwd: string = process.cwd(),
    signal?: AbortSignal,
  ) {
    if (this.type === "dfx" || this.type === "dfx-pocket-ic") {
      // prepare dfx.json for current canister
      let dfxJson = path.join(this.dir, "dfx.json");

      let oldDfxJsonData;
      if (fs.existsSync(dfxJson)) {
        oldDfxJsonData = JSON.parse(fs.readFileSync(dfxJson).toString());
      }
      let newDfxJsonData = this.dfxJson(name, name + ".wasm");

      if (oldDfxJsonData.canisters) {
        newDfxJsonData.canisters = Object.assign(
          oldDfxJsonData.canisters,
          newDfxJsonData.canisters,
        );
      }

      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(dfxJson, JSON.stringify(newDfxJsonData, null, 2));

      await spawnAsync(
        "dfx",
        [
          "deploy",
          name,
          "--mode",
          "reinstall",
          "--yes",
          "--identity",
          "anonymous",
        ],
        {
          cwd: this.dir,
          signal,
          stdio: this.verbose ? "pipe" : ["pipe", "ignore", "pipe"],
        },
      ).catch((error) => {
        if (error.code === "ABORT_ERR") {
          return { stderr: "" };
        }
        throw error;
      });

      if (signal?.aborted) {
        return;
      }

      await spawnAsync(
        "dfx",
        ["ledger", "fabricate-cycles", "--canister", name, "--t", "100"],
        {
          cwd: this.dir,
          signal,
          stdio: this.verbose ? "pipe" : ["pipe", "ignore", "pipe"],
        },
      ).catch((error) => {
        if (error.code === "ABORT_ERR") {
          return { stderr: "" };
        }
        throw error;
      });

      if (signal?.aborted) {
        return;
      }

      let canisterId = execSync(`dfx canister id ${name}`, { cwd: this.dir })
        .toString()
        .trim();

      let actor = Actor.createActor(idlFactory, {
        agent: await HttpAgent.create({
          host: "http://127.0.0.1:4945",
          shouldFetchRootKey: true,
        }),
        canisterId,
      });

      this.canisters[name] = {
        cwd,
        canisterId,
        actor,
        stream: new PassThrough(),
      };
    } else if (this.pocketIc) {
      let { canisterId, actor } = await (
        this.pocketIc.setupCanister as AnySetupCanister
      )({
        wasm,
        idlFactory,
      });

      if (signal?.aborted) {
        return;
      }

      await this.pocketIc.addCycles(canisterId as any, 1_000_000_000_000);

      if (signal?.aborted) {
        return;
      }

      this.canisters[name] = {
        cwd,
        canisterId: canisterId.toText(),
        actor,
        stream: new PassThrough(),
      };
    }

    if (!this.canisters[name]) {
      throw new Error(`Canister ${name} not found`);
    }

    return this.canisters[name];
  }

  getActor(name: string): unknown {
    if (!this.canisters[name]) {
      throw new Error(`Canister ${name} not found`);
    }
    return this.canisters[name]?.actor;
  }

  getCanister(name: string) {
    return this.canisters[name];
  }

  getCanisterId(name: string): string {
    return this.canisters[name]?.canisterId || "";
  }

  getCanisterStream(canisterId: string): PassThrough | null {
    for (let canister of Object.values(this.canisters)) {
      if (canister.canisterId === canisterId) {
        return canister.stream;
      }
    }
    return null;
  }

  dfxJson(
    canisterName: string,
    wasmPath = "canister.wasm",
    didPath = "canister.did",
  ) {
    let canisters: Record<string, any> = {};
    if (canisterName) {
      canisters[canisterName] = {
        type: "custom",
        wasm: wasmPath,
        candid: didPath,
      };
    }

    return {
      version: 1,
      canisters,
      dfx: getDfxVersion(),
      defaults: {
        build: {
          packtool: "mops sources",
        },
      },
      networks: {
        local: {
          type: "ephemeral",
          bind: "127.0.0.1:4945",
        },
      },
    };
  }
}

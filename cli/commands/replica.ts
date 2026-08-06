import process from "node:process";
import { PassThrough, type Readable } from "node:stream";

import { IDL } from "@icp-sdk/core/candid";

import {
  type PocketIc,
  type PocketIcServer,
  startPocketIc,
  serverStderr,
} from "../helpers/pocket-ic-client.js";
import { toolchain } from "./toolchain/index.js";

type StartOptions = {
  dir?: string;
  verbose?: boolean;
  silent?: boolean;
};

export class Replica {
  verbose = false;
  canisters: Record<
    string,
    { cwd: string; canisterId: string; actor: any; stream: PassThrough }
  > = {};
  pocketIcServer?: PocketIcServer;
  pocketIc?: PocketIc;
  dir: string = ""; // absolute path (/.../.mops/.test/)
  ttl = 60;

  async start({ dir, verbose, silent }: StartOptions = {}) {
    this.verbose = verbose ?? this.verbose;
    this.dir = dir ?? this.dir;

    silent || console.log("Starting pocket-ic replica...");

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
    this._attachCanisterLogHandler(serverStderr(this.pocketIcServer));
  }

  _attachCanisterLogHandler(stderr: Readable | null) {
    if (!stderr) {
      return;
    }
    let curData = "";
    stderr.on("data", (data) => {
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
    if (this.pocketIc && this.pocketIcServer) {
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
    if (!this.pocketIc) {
      throw new Error("Replica is not started");
    }

    let { canisterId, actor } = await this.pocketIc.setupCanister({
      wasm,
      idlFactory,
    });

    if (signal?.aborted) {
      return;
    }

    await this.pocketIc.addCycles(canisterId, 1_000_000_000_000n);

    if (signal?.aborted) {
      return;
    }

    this.canisters[name] = {
      cwd,
      canisterId: canisterId.toText(),
      actor,
      stream: new PassThrough(),
    };

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
}

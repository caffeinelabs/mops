import process from "node:process";
import { PassThrough, type Readable } from "node:stream";

import { IDL } from "@icp-sdk/core/candid";

import {
  type PocketIc,
  type PocketIcServer,
  startPocketIc,
  serverStderr,
} from "../helpers/pocket-ic-client.js";
import {
  stopPocketIc,
  warnAttachedCanisterLogsUnavailable,
} from "../helpers/pocket-ic-startup.js";
import { toolchain } from "./toolchain/index.js";

type StartOptions = {
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
  ttl = 60;

  async start({ verbose, silent }: StartOptions = {}) {
    this.verbose = verbose ?? this.verbose;

    silent || console.log("Starting pocket-ic replica...");

    let pic = await startPocketIc(async () => ({
      binPath: await toolchain.bin("pocket-ic"),
      showRuntimeLogs: false,
      showCanisterLogs: false,
      ttl: this.ttl,
    }));
    this.pocketIcServer = pic.server;
    this.pocketIc = pic.client;

    if (pic.server) {
      this._attachCanisterLogHandler(serverStderr(pic.server));
    } else {
      warnAttachedCanisterLogsUnavailable();
    }
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
    await stopPocketIc(
      { client: this.pocketIc, server: this.pocketIcServer },
      { sigint },
    );
    this.pocketIc = undefined;
    this.pocketIcServer = undefined;
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

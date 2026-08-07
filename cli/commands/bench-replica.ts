import process from "node:process";
import {
  type PocketIc,
  type PocketIcServer,
  startPocketIc,
} from "../helpers/pocket-ic-client.js";
import { idlFactory } from "../declarations/bench/index.js";
import { toolchain } from "./toolchain/index.js";

export class BenchReplica {
  verbose = false;
  canisters: Record<string, { cwd: string; canisterId: string; actor: any }> =
    {};
  pocketIcServer?: PocketIcServer;
  pocketIc?: PocketIc;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  async start({ silent = false } = {}) {
    if (!process.env.CI && !silent) {
      console.log("Starting pocket-ic replica...");
    }

    let pocketIcBin = await toolchain.bin("pocket-ic");

    // `@dfinity/pic` omits the flag when `ttl` is unset and lets the server
    // default apply. Passed explicitly so the lifetime of an orphaned server
    // doesn't depend on the pocket-ic default.
    let pic = await startPocketIc({ binPath: pocketIcBin, ttl: 60 });
    this.pocketIcServer = pic.server;
    this.pocketIc = pic.client;
  }

  async stop() {
    if (this.pocketIc && this.pocketIcServer) {
      await this.pocketIc.tearDown();
      await this.pocketIcServer.stop();
    }
  }

  async deploy(name: string, wasm: string, cwd: string = process.cwd()) {
    if (!this.pocketIc) {
      throw new Error("Replica is not started");
    }
    let { canisterId, actor } = await this.pocketIc.setupCanister({
      idlFactory,
      wasm,
    });
    this.canisters[name] = {
      cwd,
      canisterId: canisterId.toText(),
      actor,
    };
  }

  getActor(name: string): unknown {
    return this.canisters[name]?.actor;
  }

  getCanisterId(name: string): string {
    return this.canisters[name]?.canisterId || "";
  }
}

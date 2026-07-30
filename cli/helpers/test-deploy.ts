import chalk from "chalk";
import { getWasmBindings } from "../wasm.js";
import { toolchain } from "../commands/toolchain/index.js";
import { mapPocketIcError } from "./ic-error-codes.js";
import { startPocketIc, type AnyPocketIcServer } from "./pocket-ic-client.js";
import type { PocketIc } from "@dfinity/pic";

export interface TestDeployArtifact {
  name: string;
  wasmPath: string;
  candid: string;
  initArg?: string;
  wasmMemoryLimit?: number;
}

export async function testDeploy(
  artifacts: TestDeployArtifact[],
  { verbose = false } = {},
): Promise<void> {
  for (const artifact of artifacts) {
    if (
      artifact.wasmMemoryLimit !== undefined &&
      (!Number.isSafeInteger(artifact.wasmMemoryLimit) ||
        artifact.wasmMemoryLimit <= 0)
    ) {
      throw new Error(
        `Invalid wasmMemoryLimit for canister ${artifact.name}: expected a positive integer number of bytes`,
      );
    }
  }

  const pocketIcBin = await toolchain.bin("pocket-ic");
  let server: AnyPocketIcServer | undefined;
  let client: PocketIc | undefined;

  try {
    const pocketIc = await startPocketIc(
      {
        binPath: pocketIcBin,
        showRuntimeLogs: verbose,
        showCanisterLogs: verbose,
        ttl: 60,
      },
      { client: "dfinity" },
    );
    server = pocketIc.server;
    client = pocketIc.client;

    for (const artifact of artifacts) {
      console.log(
        chalk.blue("test deploy canister"),
        chalk.bold(artifact.name),
      );
      const canisterId = await client.createCanister(
        artifact.wasmMemoryLimit === undefined
          ? undefined
          : { wasmMemoryLimit: BigInt(artifact.wasmMemoryLimit) },
      );
      const arg = Uint8Array.from(
        getWasmBindings().encode_candid_args(
          artifact.initArg ?? "()",
          artifact.candid,
        ),
      );
      await client.installCode({
        canisterId,
        wasm: artifact.wasmPath,
        arg,
      });
    }
  } catch (error) {
    throw mapPocketIcError(error);
  } finally {
    await client?.tearDown().catch(() => {});
    await server?.stop();
  }
}

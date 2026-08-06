import chalk from "chalk";
import { getWasmBindings } from "../wasm.js";
import { toolchain } from "../commands/toolchain/index.js";
import { mapPocketIcError } from "./ic-error-codes.js";
import { startPocketIc, type AnyPocketIcServer } from "./pocket-ic-client.js";
import type { PocketIc } from "@dfinity/pic";

export interface TestDeployArtifact {
  name: string;
  wasmPath: string;
  initCandid: string;
  initArg?: string;
  wasmMemoryLimit?: number;
  hasMigrationChain: boolean;
}

export async function testDeploy(
  artifacts: TestDeployArtifact[],
  { verbose = false } = {},
): Promise<void> {
  const preparedArtifacts = artifacts.map((artifact) => {
    try {
      return {
        ...artifact,
        arg: Uint8Array.from(
          getWasmBindings().encode_candid_args(
            artifact.initArg ?? "()",
            artifact.initCandid,
          ),
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid initArg for canister ${artifact.name}: ${message}`,
        { cause: error },
      );
    }
  });

  const pocketIcBin = await toolchain.bin("pocket-ic");
  let server: AnyPocketIcServer | undefined;
  let client: PocketIc | undefined;
  let installingArtifact: TestDeployArtifact | undefined;

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

    for (const artifact of preparedArtifacts) {
      console.log(
        chalk.blue("test deploy canister"),
        chalk.bold(artifact.name),
      );
      const canisterId = await client.createCanister(
        artifact.wasmMemoryLimit === undefined
          ? undefined
          : { wasmMemoryLimit: BigInt(artifact.wasmMemoryLimit) },
      );
      installingArtifact = artifact;
      await client.installCode({
        canisterId,
        wasm: artifact.wasmPath,
        arg: artifact.arg,
      });
      installingArtifact = undefined;
    }
  } catch (error) {
    const mappedError = mapPocketIcError(error);
    const hint = installingArtifact?.hasMigrationChain
      ? `\nCanister ${installingArtifact.name} has an enhanced migration chain. If it was converted from legacy migrations, a fresh install cannot reproduce its baseline. Use \`--no-test-deploy\` to skip deployment validation for this build.`
      : "";
    throw new Error(
      `PocketIC test deployment failed\n${mappedError.message}${hint}`,
      {
        cause: error,
      },
    );
  } finally {
    await client?.tearDown().catch(() => {});
    await server?.stop().catch(() => {});
  }
}

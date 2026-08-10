import chalk from "chalk";
import { getWasmBindings } from "../wasm.js";
import { toolchain } from "../commands/toolchain/index.js";
import { startPocketIc, type AnyPocketIcServer } from "./pocket-ic-client.js";
import type { PocketIc } from "@dfinity/pic";

export interface CheckDeployArtifact {
  name: string;
  wasmPath: string;
  initCandid: string;
  initArg?: string;
  wasmMemoryLimit?: number;
  hasMigrationChain: boolean;
}

export async function checkDeploy(
  artifacts: CheckDeployArtifact[],
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
  let operationFailed = false;
  let operationError: unknown;
  const installationFailures: Array<{
    artifact: CheckDeployArtifact;
    error: Error;
  }> = [];

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
        chalk.blue("check deploy canister"),
        chalk.bold(artifact.name),
      );
      const canisterId = await client.createCanister(
        artifact.wasmMemoryLimit === undefined
          ? undefined
          : { wasmMemoryLimit: BigInt(artifact.wasmMemoryLimit) },
      );
      try {
        await client.installCode({
          canisterId,
          wasm: artifact.wasmPath,
          arg: artifact.arg,
        });
      } catch (error) {
        installationFailures.push({
          artifact,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    await client?.tearDown().catch(() => {});
    await server?.stop().catch(() => {});
  }

  if (operationFailed) {
    const message =
      operationError instanceof Error
        ? operationError.message
        : String(operationError);
    throw new Error(`PocketIC deployment check failed\n${message}`, {
      cause: operationError,
    });
  }

  if (installationFailures.length) {
    throw new Error(
      [
        "PocketIC deployment check failed",
        ...installationFailures.flatMap(({ artifact, error }) => [
          `Canister: ${artifact.name}`,
          error.message,
          ...(artifact.hasMigrationChain
            ? [
                "Hint: This canister has an enhanced migration chain, so a fresh installation may fail when a migration expects state from a previous deployment; validate the upgrade against representative baseline state.",
              ]
            : []),
        ]),
      ].join("\n"),
      { cause: installationFailures[0]?.error },
    );
  }
}

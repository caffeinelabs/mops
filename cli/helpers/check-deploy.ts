import chalk from "chalk";
import { getWasmBindings } from "../wasm.js";
import { toolchain } from "../commands/toolchain/index.js";
import { checkEmptyBaselineCompatibility } from "./empty-baseline.js";
import { stopPocketIc } from "./pocket-ic-startup.js";
import { startPocketIc, type PocketIcServer } from "./pocket-ic-client.js";
import type { PocketIc } from "@dfinity/pic";

export interface CheckDeployArtifact {
  name: string;
  wasmPath: string;
  mostPath: string;
  initCandid: string;
  initArg?: string;
  wasmMemoryLimit?: number;
}

export async function checkDeploy(
  artifacts: CheckDeployArtifact[],
  { verbose = false, mocPath }: { verbose?: boolean; mocPath: string },
): Promise<void> {
  const deployableArtifacts = await filterFreshDeployableArtifacts(
    artifacts,
    mocPath,
    verbose,
  );
  if (!deployableArtifacts.length) {
    return;
  }

  const preparedArtifacts = deployableArtifacts.map((artifact) => {
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

  let server: PocketIcServer | undefined;
  let client: PocketIc | undefined;
  let operationFailed = false;
  let operationError: unknown;
  const installationFailures: Array<{
    artifact: CheckDeployArtifact;
    error: Error;
  }> = [];

  try {
    const pocketIc = await startPocketIc(async () => ({
      binPath: await toolchain.bin("pocket-ic"),
      showRuntimeLogs: verbose,
      showCanisterLogs: verbose,
      ttl: 60,
    }));
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
    await stopPocketIc({ client, server });
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
        ]),
      ].join("\n"),
      { cause: installationFailures[0]?.error },
    );
  }
}

async function filterFreshDeployableArtifacts(
  artifacts: CheckDeployArtifact[],
  mocPath: string,
  verbose: boolean,
): Promise<CheckDeployArtifact[]> {
  const deployableArtifacts: CheckDeployArtifact[] = [];

  for (const artifact of artifacts) {
    const { compatible, compilerOutput } =
      await checkEmptyBaselineCompatibility(mocPath, artifact.mostPath, {
        verbose,
      });
    if (compatible) {
      deployableArtifacts.push(artifact);
      continue;
    }

    console.warn(
      chalk.yellow(
        [
          "Warning [MOPS-CHECK-DEPLOY-SKIPPED]:",
          `Canister: ${artifact.name}`,
          "Result: Fresh PocketIC deployment check did not run.",
          "Reason: moc reported that the generated stable state is incompatible with an empty canister.",
          ...(compilerOutput ? [`Compiler output:\n${compilerOutput}`] : []),
        ].join("\n"),
      ),
    );
  }

  return deployableArtifacts;
}

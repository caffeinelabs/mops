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

export type CheckDeployOutcome =
  | { canister: string; status: "success" }
  | { canister: string; status: "inconclusive" }
  | { canister: string; status: "failure"; error: Error };

export interface CheckDeployReport {
  outcomes: CheckDeployOutcome[];
}

export async function checkDeploy(
  artifacts: CheckDeployArtifact[],
  { verbose = false } = {},
): Promise<CheckDeployReport> {
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
  const outcomes: CheckDeployOutcome[] = [];

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
        outcomes.push({ canister: artifact.name, status: "success" });
      } catch (error) {
        const installError =
          error instanceof Error ? error : new Error(String(error));
        if (isMigrationBaselineFailure(artifact, installError)) {
          console.warn(
            chalk.yellow(formatMigrationInconclusiveWarning(artifact.name)),
          );
          outcomes.push({
            canister: artifact.name,
            status: "inconclusive",
          });
          continue;
        }
        outcomes.push({
          canister: artifact.name,
          status: "failure",
          error: installError,
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

  const failures = outcomes.filter(
    (outcome): outcome is Extract<CheckDeployOutcome, { status: "failure" }> =>
      outcome.status === "failure",
  );
  if (failures.length) {
    throw new Error(
      [
        "PocketIC deployment check failed",
        ...failures.flatMap((failure) => [
          `Canister: ${failure.canister}`,
          failure.error.message,
        ]),
      ].join("\n"),
      { cause: failures[0]?.error },
    );
  }

  const inconclusive = outcomes.filter(
    (outcome) => outcome.status === "inconclusive",
  ).length;
  if (inconclusive) {
    const successful = outcomes.length - inconclusive;
    console.warn(
      chalk.yellow(
        `Deployment check summary: ${successful} successful, ${inconclusive} inconclusive.`,
      ),
    );
  }

  return { outcomes };
}

function isMigrationBaselineFailure(
  artifact: CheckDeployArtifact,
  error: Error,
): boolean {
  return (
    artifact.hasMigrationChain &&
    error.message.includes("Error code: CanisterCalledTrap") &&
    error.message.includes("migration ") &&
    error.message.includes("expected but not found in state")
  );
}

function formatMigrationInconclusiveWarning(canister: string): string {
  return [
    "Warning [MOPS-CHECK-DEPLOY-INCONCLUSIVE]:",
    `Canister: ${canister}`,
    "Result: Fresh PocketIC installation could not be validated.",
    "Reason: This canister has an enhanced migration chain that may require state from a previous deployment. A fresh canister cannot reproduce that baseline.",
    "Impact: The Wasm build succeeded, but deployment check remains unverified.",
    "Suggested action: Validate the upgrade against a canister containing representative baseline state.",
  ].join("\n");
}

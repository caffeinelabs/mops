import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getRootDir } from "../../mops.js";

type DfxConfig = {
  $schema: string;
  version: number;
  profile: "Debug" | "Release";
  canisters: {
    [key: string]: {
      type: "motoko" | "assets";
      main?: string;
      specified_id?: string;
      declarations?: {
        output: string;
        node_compatibility: boolean;
      };
      build?: string[];
      frontend?: {
        entrypoint: string;
      };
      source?: string[];
      remote?: {
        id: {
          ic: string;
          staging: string;
        };
      };
    };
  };
  defaults: {
    build: {
      packtool: string;
    };
  };
  dfx: string;
  networks: {
    [key: string]: {
      type: string;
      providers: string[];
    };
  };
};

export function readDfxJson(): DfxConfig | Record<string, never> {
  let dfxJsonPath = path.resolve(getRootDir(), "dfx.json");
  if (!existsSync(dfxJsonPath)) {
    return {};
  }
  return JSON.parse(readFileSync(dfxJsonPath, "utf8")) as DfxConfig;
}

export function getMotokoCanisters(): Record<string, string> {
  let dfxJson = readDfxJson();
  return Object.fromEntries(
    Object.entries(dfxJson.canisters || {})
      .filter(([_, canister]) => canister.type === "motoko")
      .map(([name, canister]) => [name, canister.main ?? ""]),
  );
}

export function getMotokoCanistersWithDeclarations(): Record<string, string> {
  let dfxJson = readDfxJson();
  return Object.fromEntries(
    Object.entries(dfxJson.canisters || {})
      .filter(
        ([_, canister]) => canister.type === "motoko" && canister.declarations,
      )
      .map(([name, canister]) => [name, canister.main ?? ""]),
  );
}

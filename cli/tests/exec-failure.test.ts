import { describe, expect, test } from "@jest/globals";
import path from "node:path";
import { describeExecFailure } from "../helpers/exec-failure";
import { cleanFixture } from "./build-helpers";
import { cli } from "./helpers";

describe("describeExecFailure", () => {
  test("a normal failure reports the exit code", () => {
    expect(describeExecFailure({ exitCode: 2 })).toBe("exit code: 2");
  });

  test("a killed child reports the signal and its description", () => {
    expect(
      describeExecFailure({
        signal: "SIGKILL",
        signalDescription: "Forced termination",
        shortMessage: "Command was killed with SIGKILL: moc -c ...",
      }),
    ).toBe("killed with SIGKILL: Forced termination");
    expect(describeExecFailure({ signal: "SIGTERM" })).toBe(
      "killed with SIGTERM",
    );
  });

  test("a spawn failure reports the system error, not the command line", () => {
    expect(
      describeExecFailure({
        originalMessage: "spawn Unknown system error -88",
        shortMessage:
          "Command failed with Unknown system error -88: moc -c --idl ...",
      }),
    ).toBe("spawn Unknown system error -88");
  });

  test("nothing known still yields a reason", () => {
    expect(describeExecFailure({})).toBe("no exit code");
  });
});

describe("build with a moc that dies without an exit code", () => {
  test("names the signal instead of `exit code: undefined`", async () => {
    const cwd = path.join(import.meta.dirname, "build/moc-killed");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        "Build failed for canister main (killed with SIGKILL: Forced termination)",
      );
      expect(result.stderr).not.toMatch("undefined");
    } finally {
      cleanFixture(cwd, path.join(cwd, "mops.lock"));
    }
  });
});

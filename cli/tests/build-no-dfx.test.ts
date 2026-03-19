import { describe, test } from "@jest/globals";
import path from "path";
import { cliSnapshot } from "./helpers";

describe("build without dfx", () => {
  test("builds using mops toolchain moc", async () => {
    const cwd = path.join(import.meta.dirname, "build/no-dfx");
    await cliSnapshot(["build"], { cwd }, 0);
  }, 120_000);
});

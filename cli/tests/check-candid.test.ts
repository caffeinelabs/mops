import { describe, test } from "@jest/globals";
import path from "path";
import { cliSnapshot } from "./helpers";

describe("check-candid", () => {
  test("ok", async () => {
    const cwd = path.join(import.meta.dirname, "check-candid");
    await cliSnapshot(["check-candid", "a.did", "a.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "b.did", "b.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "c.did", "c.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "a.did", "b.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "b.did", "a.did"], { cwd }, 0);
  });

  test("error", async () => {
    const cwd = path.join(import.meta.dirname, "check-candid");
    await cliSnapshot(["check-candid", "a.did", "c.did"], { cwd }, 1);
    await cliSnapshot(["check-candid", "c.did", "a.did"], { cwd }, 1);
    await cliSnapshot(["check-candid", "b.did", "c.did"], { cwd }, 1);
    await cliSnapshot(["check-candid", "c.did", "b.did"], { cwd }, 1);
  });
});

import { describe, expect, test } from "@jest/globals";
import { classifySelfUpdate } from "../helpers/self-update-kind.js";

// The network fetch and the npm install around this are not testable here;
// the decision table is, and it is what gates the major-update confirmation.
describe("classifySelfUpdate", () => {
  test("identical versions are up to date", () => {
    expect(classifySelfUpdate("2.20.0", "2.20.0")).toBe("up-to-date");
  });

  test("minor and patch updates stay in the same major", () => {
    expect(classifySelfUpdate("2.20.0", "2.21.0")).toBe("same-major");
    expect(classifySelfUpdate("2.20.0", "2.20.1")).toBe("same-major");
  });

  test("a new major requires confirmation", () => {
    expect(classifySelfUpdate("2.20.0", "3.0.0")).toBe("major");
  });

  test("a major downgrade also requires confirmation", () => {
    expect(classifySelfUpdate("3.0.0", "2.20.0")).toBe("major");
  });

  test("a prerelease of the next major counts as a major", () => {
    expect(classifySelfUpdate("2.20.0", "3.0.0-beta.1")).toBe("major");
  });

  test("prerelease to release of the same major does not prompt", () => {
    expect(classifySelfUpdate("3.0.0-beta.1", "3.0.0")).toBe("same-major");
  });

  test("a non-version tag is rejected", () => {
    expect(classifySelfUpdate("2.20.0", "")).toBe("invalid");
    expect(classifySelfUpdate("2.20.0", "<html>error</html>")).toBe("invalid");
    expect(classifySelfUpdate("2.20.0", "latest")).toBe("invalid");
  });
});

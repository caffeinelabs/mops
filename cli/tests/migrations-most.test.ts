import { describe, expect, test } from "@jest/globals";
import {
  latestAppliedMigrationName,
  mostRequiresPreexistingState,
  parseMostAppliedMigrationNames,
} from "../helpers/parse-most";

describe("parseMostAppliedMigrationNames", () => {
  test("parses Version 4.0.0 enhanced-migration chain", () => {
    const content = `// Version: 4.0.0
{
  "20250101_000000_Init" : {} -> {a : Nat; b : Text};
  "20250201_000000_AddField" : (old : {a : Nat; b : Text}) -> {a : Nat; b : Text; c : Bool};
}
actor  {
  stable a : Nat;
  stable b : Text;
  stable c : Bool
};
`;
    expect(parseMostAppliedMigrationNames(content)).toEqual([
      "20250101_000000_Init",
      "20250201_000000_AddField",
    ]);
  });

  test("returns empty array for Version 1.0.0 (no EM chain)", () => {
    expect(
      parseMostAppliedMigrationNames("// Version: 1.0.0\nactor { };\n"),
    ).toEqual([]);
  });

  test("returns empty array for Version 3.0.0 (legacy migration)", () => {
    const content = `// Version: 3.0.0
actor ({
}, {
  stable var field1 : Nat;
  stable var field2 : Text
});
`;
    expect(parseMostAppliedMigrationNames(content)).toEqual([]);
  });

  test("returns null when version header is missing", () => {
    expect(parseMostAppliedMigrationNames("actor { };\n")).toBeNull();
  });

  test("returns null when Version 4.0.0 has no actor block", () => {
    expect(
      parseMostAppliedMigrationNames(
        '// Version: 4.0.0\n{ "Init" : {} -> {} }',
      ),
    ).toBeNull();
  });

  test("latestAppliedMigrationName picks lexicographic max", () => {
    expect(
      latestAppliedMigrationName([
        "20250101_000000_Init",
        "20250301_000000_AddD",
        "20250201_000000_AddField",
      ]),
    ).toBe("20250301_000000_AddD");
  });
});

describe("mostRequiresPreexistingState", () => {
  test("accepts an enhanced migration chain that starts from empty state", () => {
    const content = `// Version: 4.0.0
{
  "Init" : {} -> {id : Nat};
}
actor {
  stable id : Nat
};
`;
    expect(mostRequiresPreexistingState(content)).toBe(false);
  });

  test("accepts a named empty-state migration input", () => {
    const content = `// Version: 4.0.0
{
  "Init" : (_ : {}) -> {id : Nat};
}
actor {
  stable id : Nat
};
`;
    expect(mostRequiresPreexistingState(content)).toBe(false);
  });

  test("detects a chain that requires legacy state", () => {
    const content = `// Version: 4.0.0
{
  "ConvertLegacy" : (old : {id : Nat}) -> {id : Nat; name : Text};
}
actor {
  stable id : Nat;
  stable name : Text
};
`;
    expect(mostRequiresPreexistingState(content)).toBe(true);
  });

  test("does not skip deployment for older or malformed formats", () => {
    expect(
      mostRequiresPreexistingState("// Version: 3.0.0\nactor ({}, {});"),
    ).toBe(false);
    expect(
      mostRequiresPreexistingState('// Version: 4.0.0\n{ "Init" : Bad }'),
    ).toBe(false);
  });
});

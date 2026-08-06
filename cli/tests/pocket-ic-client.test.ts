import { describe, expect, jest, test } from "@jest/globals";
const { assertDfinityClientSupportsPocketIc, createClientOrStopServer } =
  await import("../helpers/pocket-ic-startup");

describe("PocketIC client compatibility", () => {
  test.each(["4.0.0", "8.9.9"])(
    "rejects PocketIC %s for the dfinity client",
    (version) => {
      expect(() => assertDfinityClientSupportsPocketIc(version)).toThrow(
        `PocketIC ${version} is incompatible with test deployment`,
      );
    },
  );

  test.each(["9.0.0", "12.0.0"])(
    "accepts PocketIC %s for the dfinity client",
    (version) => {
      expect(() => assertDfinityClientSupportsPocketIc(version)).not.toThrow();
    },
  );

  test.each(["./bin/pocket-ic", "../tools/pocket-ic", "/opt/pocket-ic"])(
    "accepts a path-pinned PocketIC binary at %s",
    (version) => {
      expect(() => assertDfinityClientSupportsPocketIc(version)).not.toThrow();
    },
  );

  test.each(["8", "latest", "not-a-version"])(
    "rejects malformed PocketIC version %s",
    (version) => {
      expect(() => assertDfinityClientSupportsPocketIc(version)).toThrow(
        "Use an exact semantic version",
      );
    },
  );
});

describe("PocketIC client startup", () => {
  test("stops the server when client creation fails", async () => {
    const error = new Error("client creation failed");
    const stop = jest.fn(async () => {});

    await expect(
      createClientOrStopServer({ stop }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("preserves the client error when stopping also fails", async () => {
    const error = new Error("client creation failed");
    const stop = jest.fn(async () => {
      throw new Error("server stop failed");
    });

    await expect(
      createClientOrStopServer({ stop }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("leaves the server running after client creation succeeds", async () => {
    const client = {};
    const stop = jest.fn(async () => {});

    await expect(
      createClientOrStopServer({ stop }, async () => client),
    ).resolves.toBe(client);
    expect(stop).not.toHaveBeenCalled();
  });
});

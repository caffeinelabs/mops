import { afterEach, describe, expect, jest, test } from "@jest/globals";
const {
  assertDfinityClientSupportsPocketIc,
  createClientOrStopServer,
  getPocketIcUrl,
  hasPocketIcSource,
  stopPocketIc,
  warnIgnoredPocketIcPin,
} = await import("../helpers/pocket-ic-startup");

describe("PocketIC client compatibility", () => {
  test.each(["4.0.0", "8.9.9"])(
    "rejects PocketIC %s for the dfinity client",
    (version) => {
      expect(() => assertDfinityClientSupportsPocketIc(version)).toThrow(
        `PocketIC ${version} is incompatible with deployment checks`,
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

describe("MOPS_POCKET_IC_URL", () => {
  const original = process.env.MOPS_POCKET_IC_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MOPS_POCKET_IC_URL;
    } else {
      process.env.MOPS_POCKET_IC_URL = original;
    }
  });

  test("is unset when the env var is missing or blank", () => {
    delete process.env.MOPS_POCKET_IC_URL;
    expect(getPocketIcUrl()).toBeUndefined();
    expect(hasPocketIcSource(undefined)).toBe(false);
    expect(hasPocketIcSource("15.0.0")).toBe(true);
    process.env.MOPS_POCKET_IC_URL = "  ";
    expect(getPocketIcUrl()).toBeUndefined();
  });

  test("trims and strips a trailing slash", () => {
    process.env.MOPS_POCKET_IC_URL = " http://127.0.0.1:8001/ ";
    expect(getPocketIcUrl()).toBe("http://127.0.0.1:8001");
  });

  test("accepts https", () => {
    process.env.MOPS_POCKET_IC_URL = "https://pocket-ic.example:443";
    expect(getPocketIcUrl()).toBe("https://pocket-ic.example:443");
  });

  test("rejects a non-http URL", () => {
    process.env.MOPS_POCKET_IC_URL = "ftp://example.com";
    expect(() => getPocketIcUrl()).toThrow("must be an http or https URL");
  });

  test("rejects garbage", () => {
    process.env.MOPS_POCKET_IC_URL = "not a url";
    expect(() => getPocketIcUrl()).toThrow("not a valid URL");
  });

  test("warns once when a pin is ignored, and stops reading the pin after", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const getVersion = jest.fn(() => "15.0.0");
    warnIgnoredPocketIcPin(getVersion);
    warnIgnoredPocketIcPin(getVersion);
    expect(log).toHaveBeenCalledTimes(1);
    expect(getVersion).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch("MOPS_POCKET_IC_URL");
    expect(log.mock.calls[0]?.[0]).toMatch("15.0.0");
    log.mockRestore();
  });
});

describe("stopPocketIc", () => {
  test("deletes an attached instance and does not stop a server", async () => {
    const tearDown = jest.fn(async () => {});
    await stopPocketIc({ client: { tearDown } as never });
    expect(tearDown).toHaveBeenCalledTimes(1);
  });

  test("deletes an attached instance on SIGINT", async () => {
    const tearDown = jest.fn(async () => {});
    await stopPocketIc({ client: { tearDown } as never }, { sigint: true });
    expect(tearDown).toHaveBeenCalledTimes(1);
  });

  test("skips tearDown on SIGINT when mops spawned the server", async () => {
    const tearDown = jest.fn(async () => {});
    const stop = jest.fn(async () => {});
    await stopPocketIc(
      { client: { tearDown } as never, server: { stop } as never },
      { sigint: true },
    );
    expect(tearDown).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("tears down then stops a spawned server on a normal stop", async () => {
    const tearDown = jest.fn(async () => {});
    const stop = jest.fn(async () => {});
    await stopPocketIc({
      client: { tearDown } as never,
      server: { stop } as never,
    });
    expect(tearDown).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("stops a server that has no client (failed client creation)", async () => {
    const stop = jest.fn(async () => {});
    await stopPocketIc({ server: { stop } as never });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, jest, test } from "@jest/globals";
import { createClientOrStopServer } from "../helpers/pocket-ic-client.js";

describe("createClientOrStopServer", () => {
  test("returns the client and leaves the server running", async () => {
    const stop = jest.fn<() => Promise<void>>().mockResolvedValue();

    const client = await createClientOrStopServer({ stop }, async () => "ok");

    expect(client).toBe("ok");
    expect(stop).not.toHaveBeenCalled();
  });

  test("stops the server when client creation fails", async () => {
    const stop = jest.fn<() => Promise<void>>().mockResolvedValue();

    await expect(
      createClientOrStopServer({ stop }, async () => {
        throw new Error("connect refused");
      }),
    ).rejects.toThrow("connect refused");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("reports the creation error even when stopping also fails", async () => {
    const stop = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("stop failed"));

    await expect(
      createClientOrStopServer({ stop }, async () => {
        throw new Error("connect refused");
      }),
    ).rejects.toThrow("connect refused");
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

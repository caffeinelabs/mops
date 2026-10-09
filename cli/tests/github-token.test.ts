import { afterEach, describe, expect, jest, test } from "@jest/globals";

let octokitOptions: unknown[] = [];

jest.unstable_mockModule("octokit", () => ({
  Octokit: class {
    constructor(options: unknown) {
      octokitOptions.push(options);
    }
    request = async () => ({ status: 200, data: [] });
  },
}));

let { getGithubCommit } = await import("../mops.js");
let { getReleaseTags } =
  await import("../commands/toolchain/toolchain-utils.js");

const SHA = "06d7c77accb9fb08830643aa8f0e346295f6b263";

// CI sets GITHUB_TOKEN for the whole suite, so every case pins its own value.
describe("GITHUB_TOKEN", () => {
  const saved = process.env.GITHUB_TOKEN;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = saved;
    }
    octokitOptions = [];
    jest.restoreAllMocks();
  });

  const mockFetch = (status: number, body: unknown) =>
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify(body), { status }),
      );

  const headersOf = (call: unknown[]) =>
    new Headers((call[1] as RequestInit | undefined)?.headers);

  test("authenticates commit lookups when set", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    let fetchMock = mockFetch(200, { sha: SHA });

    expect((await getGithubCommit("org/repo", "main")).sha).toBe(SHA);
    expect(headersOf(fetchMock.mock.calls[0]!).get("authorization")).toBe(
      "Bearer test-token",
    );
  });

  test("stays anonymous when unset or empty", async () => {
    for (let value of [undefined, ""]) {
      if (value === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = value;
      }
      let fetchMock = mockFetch(200, { sha: SHA });

      await getGithubCommit("org/repo", "main");
      expect(headersOf(fetchMock.mock.calls[0]!).has("authorization")).toBe(
        false,
      );
      fetchMock.mockRestore();
    }
  });

  test("a rejected token names the variable", async () => {
    process.env.GITHUB_TOKEN = "stale-token";
    mockFetch(401, { message: "Bad credentials" });

    await expect(getGithubCommit("org/repo", "main")).rejects.toThrow(
      "Failed to fetch commit for org/repo#main: Bad credentials (check GITHUB_TOKEN)",
    );
  });

  test("a rate limit surfaces GitHub's message", async () => {
    delete process.env.GITHUB_TOKEN;
    let fetchMock = mockFetch(403, {
      message: "API rate limit exceeded for 203.0.113.7.",
    });

    await expect(getGithubCommit("org/repo", "main")).rejects.toThrow(
      "Failed to fetch commit for org/repo#main: API rate limit exceeded for 203.0.113.7.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("authenticates toolchain release lookups when set", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    await getReleaseTags("org/repo");
    expect(octokitOptions).toEqual([{ auth: "test-token" }]);

    delete process.env.GITHUB_TOKEN;
    await getReleaseTags("org/repo");
    expect(octokitOptions[1]).toEqual({ auth: undefined });
  });
});

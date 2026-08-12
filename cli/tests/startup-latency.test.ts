import http from "node:http";
import { AddressInfo } from "node:net";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "@jest/globals";

// The registry canister id is irrelevant to the stub, which answers every path,
// but it must be a valid principal for the agent to encode the request.
const CANISTER_ID = "oknww-riaaa-aaaam-qaf6a-cai";
const PROBE = path.join(
  dirname(fileURLToPath(import.meta.url)),
  "startup-latency/probe.ts",
);

interface Request {
  method: string;
  path: string;
  bodyLength: number;
}

let server: http.Server;
let requests: Request[] = [];
let host = "";

// notifyInstalls pulls in the generated candid declarations, which jest's ESM
// resolver cannot load in-process, so the probe runs in a real node process.
const runProbe = async (deps: Record<string, string>) => {
  const result = await execa("npx", ["tsx", PROBE, JSON.stringify(deps)], {
    env: {
      ...process.env,
      MOPS_NETWORK: "ic",
      MOPS_REGISTRY_HOST: host,
      MOPS_REGISTRY_CANISTER_ID: CANISTER_ID,
    },
    stdio: "pipe",
    reject: false,
  });
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as { ms: number };
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let length = 0;
    req.on("data", (chunk: Buffer) => (length += chunk.length));
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        bodyLength: length,
      });
      res.writeHead(202).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
});

describe("notifyInstalls", () => {
  test("submits one v2 call and never waits for a certified reply", async () => {
    await runProbe({ core: "2.1.0", base: "0.14.0" });

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /api/v2/canister/${CANISTER_ID}/call`,
    ]);
    expect(requests[0]!.bodyLength).toBeGreaterThan(0);
  });

  test("does not sync time against the ICP ledger canister", async () => {
    await runProbe({ core: "2.1.0" });

    // An eager syncTime reads state from ryjl3-tyaaa-aaaaa-aaaba-cai.
    expect(requests.some((r) => r.path.includes("read_state"))).toBe(false);
    expect(requests.some((r) => r.path.includes("ryjl3-tyaaa"))).toBe(false);
  });

  test("skips the call entirely when no mops packages were installed", async () => {
    await runProbe({ local: "./vendor/local", gh: "https://github.com/o/r" });

    expect(requests).toEqual([]);
  });
});

import { execSync } from "node:child_process";

export function getDfxVersion(): string {
  try {
    let res = execSync("dfx --version").toString();
    return res.trim().split("dfx ")[1] || "";
  } catch {}
  return "";
}

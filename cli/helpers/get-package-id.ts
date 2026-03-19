import { getDepName } from "./get-dep-name.js";

export function getPackageId(name: string, version: string): string {
  return getDepName(name) + "@" + version;
}

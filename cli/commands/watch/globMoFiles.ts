import { globSync } from "glob";

let globConfig = {
  nocase: true,
  ignore: [
    "**/node_modules/**",
    "**/.mops/**",
    "**/.git/**",
    "**/.dfx/**",
    "**/{build,bundle,dist}/**",
  ],
};

export function globMoFiles(rootDir: string) {
  return globSync("**/*.mo", { cwd: rootDir, ...globConfig });
}

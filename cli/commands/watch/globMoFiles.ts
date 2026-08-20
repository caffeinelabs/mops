import { globSync } from "glob";

let globConfig = {
  nocase: true,
  ignore: [
    "**/node_modules/**",
    "**/.mops/**",
    "**/.git/**",
    // not dfx support — just a build dir users may still have lying around
    "**/.dfx/**",
    "**/{build,bundle,dist}/**",
  ],
};

export function globMoFiles(rootDir: string) {
  return globSync("**/*.mo", { cwd: rootDir, ...globConfig });
}

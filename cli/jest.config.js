/** @type {import("jest").Config} **/
export default {
  preset: "ts-jest/presets/default-esm",
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
    "<rootDir>/bundle/",
    "<rootDir>/commands/",
  ],
  // Source files import each other with .js suffixes (ESM), which jest cannot
  // resolve back to the .ts sources without this mapping.
  moduleNameMapper: {
    // The generated declarations are real .js next to a .did of the same name,
    // so stripping the suffix hands jest the Candid file to parse as JavaScript.
    // Must precede the general rule — jest takes the first pattern that matches.
    "^(\\.{1,2}/.*\\.did)\\.js$": "$1.js",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  testTimeout: 60000,
};

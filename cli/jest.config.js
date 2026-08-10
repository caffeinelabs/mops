/** @type {import("jest").Config} **/
export default {
  preset: "ts-jest/presets/default-esm",
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
    "<rootDir>/bundle/",
    "<rootDir>/commands/"
  ],
  // Source files import each other with .js suffixes (ESM), which jest cannot
  // resolve back to the .ts sources without this mapping.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 60000,
};

/** @type {import("jest").Config} **/
export default {
  preset: "ts-jest/presets/default-esm",
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
    "<rootDir>/bundle/",
    "<rootDir>/commands/"
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  testTimeout: 60000,
};

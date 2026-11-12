export default {
  "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,css,html}": "prettier --write",
  // `mops format` takes a filter, not a list of files, so it formats them all.
  "*.mo": () => "mops format",
};

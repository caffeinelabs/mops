/**
 * Common ignore patterns for glob operations across Motoko files.
 */
export const MOTOKO_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.mops/**",
  "**/.vessel/**",
  "**/.git/**",
  "**/dist/**",
];

/**
 * Common glob configuration for Motoko file operations
 */
export const MOTOKO_GLOB_CONFIG = {
  nocase: true,
  ignore: MOTOKO_IGNORE_PATTERNS,
};

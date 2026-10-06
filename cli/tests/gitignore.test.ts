import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dropGitIgnored } from "../helpers/gitignore.js";

// `files` are created empty, `ignores` maps a directory to its `.gitignore`.
const makeTree = (files: string[], ignores: Record<string, string> = {}) => {
  let root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mops-gitignore-")),
  );
  for (let file of files) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "");
  }
  for (let [dir, content] of Object.entries(ignores)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, ".gitignore"), content);
  }
  return root;
};

const kept = (root: string, files: string[], projectDir = "") =>
  dropGitIgnored(files, path.join(root, projectDir));

describe("dropGitIgnored", () => {
  test("drops what the root .gitignore excludes", () => {
    let files = [
      "src/Main.mo",
      "test/Main.test.mo",
      "test/generated/ImportAll.test.mo",
    ];
    let root = makeTree(files, { ".": "/test/generated\n" });
    expect(kept(root, files)).toEqual(["src/Main.mo", "test/Main.test.mo"]);
  });

  test("accepts absolute and root-relative paths", () => {
    let root = makeTree(["gen/A.mo", "src/B.mo"], { ".": "gen/\n" });
    let files = [path.join(root, "gen/A.mo"), path.join(root, "src/B.mo")];
    expect(kept(root, files)).toEqual([path.join(root, "src/B.mo")]);
    expect(kept(root, ["gen/A.mo", "src/B.mo"])).toEqual(["src/B.mo"]);
  });

  test("a nested .gitignore applies only below its own directory", () => {
    let files = ["Gen.mo", "src/Gen.mo", "src/deep/Gen.mo", "src/Main.mo"];
    let root = makeTree(files, { src: "Gen.mo\n" });
    expect(kept(root, files)).toEqual(["Gen.mo", "src/Main.mo"]);
  });

  test("a nested anchored pattern is relative to its own directory", () => {
    let files = ["src/gen/A.mo", "src/lib/gen/B.mo", "gen/C.mo"];
    let root = makeTree(files, { src: "/gen\n" });
    expect(kept(root, files)).toEqual(["src/lib/gen/B.mo", "gen/C.mo"]);
  });

  test("a deeper .gitignore overrides a shallower one", () => {
    let files = ["src/Keep.gen.mo", "src/Drop.gen.mo", "Keep.gen.mo"];
    let root = makeTree(files, {
      ".": "*.gen.mo\n",
      src: "!Keep.gen.mo\n",
    });
    expect(kept(root, files)).toEqual(["src/Keep.gen.mo"]);
  });

  test("a deeper .gitignore can re-include a directory", () => {
    let files = ["gen/A.mo", "lib/gen/B.mo"];
    let root = makeTree(files, { ".": "gen/\n", lib: "!gen/\n" });
    expect(kept(root, files)).toEqual(["lib/gen/B.mo"]);
  });

  test("nothing inside an ignored directory is re-included", () => {
    let files = ["gen/A.mo", "src/B.mo"];
    let root = makeTree(files, { ".": "gen/\n", gen: "!*.mo\n" });
    expect(kept(root, files)).toEqual(["src/B.mo"]);
  });

  test("comments, blank lines and CRLF line endings", () => {
    let files = ["A.mo", "B.mo", "#C.mo"];
    let root = makeTree(files, { ".": "# A.mo\r\n\r\nB.mo\r\n\\#C.mo\r\n" });
    expect(kept(root, files)).toEqual(["A.mo"]);
  });

  test("matching is case-sensitive", () => {
    let files = ["generated/A.mo", "Generated/B.mo"];
    let root = makeTree(files, { ".": "/Generated\n" });
    expect(kept(root, files)).toEqual(["generated/A.mo"]);
  });

  test("glob characters in a directory name are literal", () => {
    let files = ["[id]/Gen.mo", "i/Gen.mo"];
    let root = makeTree(files, { "[id]": "Gen.mo\n" });
    expect(kept(root, files)).toEqual(["i/Gen.mo"]);
  });

  describe("in a repository", () => {
    test("the repository's .gitignore files above the project apply", () => {
      let files = ["backend/generated/A.mo", "backend/src/B.mo"];
      let root = makeTree([".git/HEAD", ...files], {
        ".": "/backend/generated\n",
      });
      expect(kept(root, ["generated/A.mo", "src/B.mo"], "backend")).toEqual([
        "src/B.mo",
      ]);
    });

    test("a .gitignore outside the repository is not read", () => {
      let root = makeTree(["repo/.git/HEAD", "repo/src/A.mo"], {
        ".": "*.mo\n",
      });
      expect(kept(root, ["src/A.mo"], "repo")).toEqual(["src/A.mo"]);
    });

    test("a linked worktree's .git file marks the repository root", () => {
      let root = makeTree(["repo/.git", "repo/src/A.mo"], { ".": "*.mo\n" });
      expect(kept(root, ["src/A.mo"], "repo")).toEqual(["src/A.mo"]);
    });

    test(".git/info/exclude is not read", () => {
      let root = makeTree([".git/HEAD", "src/A.mo"]);
      fs.mkdirSync(path.join(root, ".git/info"));
      fs.writeFileSync(path.join(root, ".git/info/exclude"), "*.mo\n");
      expect(kept(root, ["src/A.mo"])).toEqual(["src/A.mo"]);
    });

    test("a project the repository ignores as a whole reads only its own", () => {
      let files = ["scratch/proj/src/A.mo", "scratch/proj/gen/B.mo"];
      let root = makeTree([".git/HEAD", ...files], {
        ".": "scratch/\n",
        "scratch/proj": "/gen\n",
      });
      expect(kept(root, ["src/A.mo", "gen/B.mo"], "scratch/proj")).toEqual([
        "src/A.mo",
      ]);
    });
  });

  test("files outside the project are kept", () => {
    let root = makeTree(["proj/A.mo", "other/B.mo"], { proj: "*.mo\n" });
    expect(kept(root, ["../other/B.mo"], "proj")).toEqual(["../other/B.mo"]);
  });

  test("without a project root nothing is dropped", () => {
    expect(dropGitIgnored(["gen/A.mo"], "")).toEqual(["gen/A.mo"]);
  });
});

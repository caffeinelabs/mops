import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";

export function findChangelogEntry(changelog: string, version: string): string {
  let tree = fromMarkdown(changelog);
  let found = false;
  let depth = 0;
  let nodes = [];

  for (let node of tree.children) {
    if (found) {
      if (node.type === "heading" && node.depth <= depth) {
        break;
      } else {
        nodes.push(node);
      }
    } else if (
      node.type === "heading" &&
      toMarkdown(node).match(new RegExp(`\\b${version}\\b`))
    ) {
      depth = node.depth;
      found = true;
    }
  }

  return toMarkdown({
    type: "root",
    children: nodes,
  });
}

import fs from "node:fs";

export function copyTemplateFileSync(file: string, dest: string) {
  fs.copyFileSync(new URL(`./templates/${file}`, import.meta.url), dest);
}

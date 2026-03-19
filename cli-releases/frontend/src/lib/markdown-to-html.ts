import markdownIt from "markdown-it";
// import {toHtml} from 'hast-util-to-html';

export function markdownToHtml(markdown: string, repositoryUrl?: string) {
  // make links to issues and PRs clickable
  if (repositoryUrl) {
    markdown = markdown.replace(
      /\(#(\d+)\)/g,
      `([#$1](${repositoryUrl}/issues/$1))`,
    );
  }

  return markdownIt({
    html: false, // Enable HTML tags in source
    breaks: false, // Convert '\n' in paragraphs into <br>
    linkify: true, // Autoconvert URL-like text to links
    typographer: false,
  }).render(markdown);
}

import markdownIt from "markdown-it";
import { toHtml } from "hast-util-to-html";

import { getStarryNight } from "./get-starry-night";

export let markdownToHtml = async (
  markdown: string,
  repositoryUrl?: string,
) => {
  // make links to issues and PRs clickable
  if (repositoryUrl) {
    markdown = markdown.replace(
      /\(#(\d+)\)/g,
      `([#$1](${repositoryUrl}/issues/$1))`,
    );
  }

  let starryNight = await getStarryNight();

  let div = document.createElement("div");
  let mdit = markdownIt({
    html: false, // Enable HTML tags in source
    breaks: false, // Convert '\n' in paragraphs into <br>
    linkify: true, // Autoconvert URL-like text to links

    // Enable some language-neutral replacement + quotes beautification
    // For the full list of replacements, see https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.js
    typographer: false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "“”‘’",

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externally.
    // If result starts with <pre... internal wrapper is skipped.
    highlight(str, lang) {
      if (lang === "motoko") {
        return toHtml(starryNight.highlight(str, "source.mo"));
      }
      return "";
    },
  });

  mdit.render(markdown);

  div.innerHTML = mdit.render(markdown);

  // replace relative url to github absolute url
  if (repositoryUrl) {
    let relToAbs = (url: string) => {
      if (url && !url.startsWith("http") && !url.startsWith("#")) {
        let sep = url.startsWith("/") ? "" : "/";
        let urlObj = new URL(repositoryUrl);
        urlObj.host = "raw.githubusercontent.com";
        return urlObj.toString() + sep + "master/" + url;
      }
      return url;
    };
    div.querySelectorAll("img").forEach((img) => {
      img.src = relToAbs(img.getAttribute("src"));
    });
    div.querySelectorAll("a").forEach((a) => {
      a.href = relToAbs(a.getAttribute("href"));
    });
  }

  // add anchors to headings
  let anchors = new Set();
  div.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    let id = el.textContent
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s/g, "-");
    if (anchors.has(id)) {
      let i = 1;
      while (anchors.has(id + "-" + i)) {
        i++;
      }
      id += "-" + i;
    }
    anchors.add(id);
    el.innerHTML = `<a name="${id}" href="#${id}">#</a> ${el.innerHTML}`;
    el.id = id;
  });

  return div.innerHTML;
};

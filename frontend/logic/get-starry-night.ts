import { createStarryNight } from "@wooorm/starry-night";
// @ts-ignore
import moGrammar from "@wooorm/starry-night/source.mo";
// @ts-ignore
import mdGrammar from "@wooorm/starry-night/text.md";
// @ts-ignore
import tomlGrammar from "@wooorm/starry-night/source.toml";

type StarryNight = Awaited<ReturnType<typeof createStarryNight>>;

declare global {
  // eslint-disable-next-line no-unused-vars, no-var
  var starryNight: StarryNight;
}

export async function getStarryNight(): Promise<StarryNight> {
  if (!window.starryNight) {
    window.starryNight = await createStarryNight(
      [moGrammar, mdGrammar, tomlGrammar],
      {
        getOnigurumaUrlFetch: () => {
          return new URL("/external/onig@1.7.0.wasm", import.meta.url);
        },
      },
    );
  }

  return window.starryNight;
}

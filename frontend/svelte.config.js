import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  compilerOptions: {
    compatibility: {
      componentApi: 4,
    },
  },
  preprocess: vitePreprocess(),
  onwarn: (warning, handler) => {
    if (warning.code.startsWith("a11y-")) {
      return;
    }
    handler(warning);
  },
};

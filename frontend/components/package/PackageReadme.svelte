<script lang="ts">
	import "@wooorm/starry-night/style/light";
	import {markdownToHtml} from "/logic/markdown-to-html";

	export let readme = "";
	export let repository = "";
</script>

<div class="readme">
	{#await markdownToHtml(readme, repository)}
		Loading...
	{:then html}
		{@html html}
	{/await}
</div>

<style>
	.readme {
		line-height: 1.5;
	}

	:global(.readme img) {
		max-width: 100%;
	}
</style>
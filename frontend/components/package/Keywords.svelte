<script lang="ts">
	import {link} from "svelte-spa-history-router";

	export let keywords : string[];
</script>

<div class="keywords">
	{#each keywords as keyword}
		<a class="keyword" href="/search/keyword:{keyword}" use:link>#{keyword}</a>
	{/each}
</div>

<style>
	.keywords {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		font-family: 'Open Sans', monospace;
		font-size: 14px;
	}
</style>
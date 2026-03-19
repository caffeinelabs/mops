<script lang="ts">
	import {link, routeParams} from "svelte-spa-history-router";

	type TreeNode = {
		name : string;
		path : string;
		children : TreeNode[];
	};

	export let node : TreeNode;
	export let root = false;
	export let nesting = 0;

	let expanded : null | boolean = null;

	$: {
		if (expanded == null && $routeParams.file?.startsWith(node.path + "/")) {
			expanded = true;
		}
	}

	function isFileSelected(file : string, selectedFileName : string) {
		return file == selectedFileName;
	}
</script>

<div class="tree" class:root={root} style="--nesting: {nesting}">
	<!-- {#if !root} -->
		{#if node.children.length > 0}
			<div class="folder" class:expanded={expanded} on:click={() => expanded = !expanded} on:keydown={(e) => e.key === "Enter" && (expanded = !expanded)} role="tree" tabindex="0">
				<svg class="arrow" viewBox="0 0 40 37" xmlns="http://www.w3.org/2000/svg">
					<path d="M5 12.5l15 15 15-15" stroke="var(--color-primary)" stroke-width="5" fill="none"></path>
				</svg>
				{node.name}
			</div>
		{:else}
			<a
				class="file"
				class:selected={isFileSelected(node.path, $routeParams.file)}
				href="/{$routeParams.packageId}/{$routeParams.tab}/{node.path}"
				use:link
			>
				{node.name}
			</a>
		{/if}
	<!-- {/if} -->

	{#if expanded}
		{#each node.children as child}
			<svelte:self node={child} nesting={nesting + 1} />
		{/each}
	{/if}
</div>

<style>
	.folder {
		display: flex;
		align-items: center;
		font-weight: 500;
	}

	.arrow {
		width: 14px;
	}

	.folder:not(.expanded) .arrow {
		transform: rotate(-90deg);
	}

	:is(.folder, .file) {
		display: block;
		padding: 6px 12px;
		padding-left: calc(var(--nesting) * 1rem + 12px);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--color-primary);
		cursor: pointer;
	}

	:is(.folder, .file):hover {
		background: rgb(247, 247, 247);
	}

	.file.selected {
		background: var(--color-secondary);
		color: black;
	}
</style>
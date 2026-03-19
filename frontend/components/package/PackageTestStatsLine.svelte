<script lang="ts">
	import {PackageDetails} from "/declarations/main/main.did.js";

	type NestedStats = { [key : string] : NestedStats | boolean };

	export let packageDetails : PackageDetails;
	export let nestedStats : NestedStats;
	export let root = true;

	function allNestedCount(nested : NestedStats | boolean) : number {
		if (nested === false) {
			return 1;
		}
		return Object.values(nested).map(x => allNestedCount(x), 0).reduce((x, y) => x + y);
	}
</script>

<div class="test-stats" class:root={root}>
	{#each Object.entries(nestedStats) as [name, nested]}
		{#if nested}
			<details>
				<summary>
					<div class="name">
						{name} ({allNestedCount(nested)})
					</div>
					{#if root}
						<a class="link" href="{packageDetails.config.repository}/blob/master/{name}" target="_blank">[source]</a>
					{/if}
				</summary>
				<svelte:self {packageDetails} nestedStats={nested} root={false}/>
			</details>
		{:else}
			<div>
				<span style="color: green">✓</span> {name}
				{#if root}
					<a class="link" href="{packageDetails.config.repository}/blob/master/{name}" target="_blank">[source]</a>
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	.test-stats {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 10px;
		padding-left: 16px;
	}

	.test-stats.root {
		padding-left: 0;
	}

	summary {
		cursor: pointer;
		padding: 2px 0;
		pointer-events: none;
	}

	summary::marker, .name, .link {
		pointer-events: auto;
	}

	.name {
		display: inline-flex;
		gap: 20px;
		align-items: center;
		justify-content: space-between;
	}

	.link {
		margin-left: 10px;
		opacity: 0.6;
	}

	.link:hover {
		opacity: 1;
	}
</style>
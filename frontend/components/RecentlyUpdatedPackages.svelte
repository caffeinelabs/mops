<script lang="ts">
	import {onMount} from "svelte";
	import Loader from "./Loader.svelte";
	import {PackageSummaryWithChanges} from "/declarations/main/main.did.js";
	import {mainActor} from "/logic/actors";
	import PackageVersionSummary from "./package/PackageVersionSummary.svelte";

	let loaded = false;
	let packages : PackageSummaryWithChanges[] = [];

	onMount(async () => {
		packages = await mainActor().getRecentlyUpdatedPackages();
		loaded = true;
	});
</script>

<div class="recently-updated">
	<div class="title">Recently Updated</div>

	{#if loaded}
		{#each packages as pkg}
			<PackageVersionSummary summary={pkg} showName={true}></PackageVersionSummary>
		{:else}
			{#if loaded}
				<div class="not-found">Packages not found</div>
			{/if}
		{/each}
	{:else}
		<Loader></Loader>
	{/if}
</div>

<style>
	.recently-updated {
		display: flex;
		flex-direction: column;
		align-self: flex-start;
		gap: 10px;
		margin-top: 10px;
		flex-grow: 1;
		min-height: 0;
	}

	.title {
		font-size: 22px;
		font-weight: 600;
		margin-bottom: 22px;
		text-align: center;
	}
</style>
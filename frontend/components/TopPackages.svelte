<script lang="ts">
	import {onMount} from "svelte";
	import Loader from "./Loader.svelte";
	import PackageCard from "./package/PackageCard.svelte";
	import {PackageSummary} from "/declarations/main/main.did.js";
	import {mainActor} from "/logic/actors";

	export let type : "recently-updated" | "most-downloaded" | "new" = "recently-updated";
	let loaded = false;
	let packages : PackageSummary[] = [];

	onMount(async () => {
		if (type === "recently-updated") {
			packages = await mainActor().getRecentlyUpdatedPackages();
		}
		else if (type === "most-downloaded") {
			packages = await mainActor().getMostDownloadedPackagesIn7Days();
		}
		else if (type === "new") {
			packages = await mainActor().getNewPackages();
		}
		loaded = true;
	});

	let title = "";
	$: if (type === "recently-updated") {
		title = "Recently Updated";
	}
	else if (type === "most-downloaded") {
		title = "Most Downloaded in 7 days";
	}
	else if (type === "new") {
		title = "New Packages";
	}
</script>

<div class="top-packages">
	<div class="title">{title}</div>

	{#if loaded}
		{#each packages as pkg}
			<PackageCard
				{pkg}
				showUpdated={type === "recently-updated"}
				showFirstPublished={type === "new"}
				showVersion={type === "recently-updated"}
				show7DayDownloads={type === "most-downloaded"}
			></PackageCard>
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
	.top-packages {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-self: flex-start;
		max-width: 100%;
		box-sizing: border-box;
		margin-top: 10px;
		width: 390px;
	}

	.title {
		font-size: 22px;
		font-weight: 600;
		margin-bottom: 10px;
	}
</style>
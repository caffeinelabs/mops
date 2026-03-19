<script lang="ts">
	import {onMount} from "svelte";
	import {debounce} from "throttle-debounce";
	import {link, currentURL} from "svelte-spa-history-router";

	import {PackageSummary} from "/declarations/main/main.did.js";
	import {mainActor} from "/logic/actors";

	import Header from "./Header.svelte";
	import Loader from "./Loader.svelte";
	import PackageCard from "./package/PackageCard.svelte";
	import NotFound from "./NotFound.svelte";
	import Footer from "./Footer.svelte";

	$: searchText = decodeURI($currentURL.pathname.split("/search/")[1]);
	$: page = parseInt($currentURL.searchParams.get("page")) || 1;
	$: $currentURL && updateResults();

	let packages : PackageSummary[] = [];
	let loaded = false;
	let pageCount = 1;

	let updateResults = debounce(10, () => {
		loaded = false;

		mainActor().search(searchText, [10n], [BigInt(page) - 1n]).then((res) => {
			packages = res[0];
			pageCount = Number(res[1]);
			loaded = true;
		});
	});

	onMount(updateResults);
</script>

<svelte:head>
	<title>Mops • Motoko Package Manager</title>
</svelte:head>

<Header searchText="{searchText}"></Header>

<div class="search-results">
	{#if loaded}
		{#each packages as pkg}
			<PackageCard {pkg} showUpdated={true} showDownloads={true}></PackageCard>
		{:else}
			<NotFound>Packages not found</NotFound>
		{/each}
		{#if pageCount > 1}
			<div class="pages">
				{#each Array(pageCount) as _, i}
					<a href="/search/{searchText}?page={i + 1}" class="page-link {page === i + 1 ? "active" : ""}" use:link>{i + 1}</a>
				{/each}
			</div>
		{/if}
	{:else}
		<Loader></Loader>
	{/if}
</div>

<Footer />

<style>
	.search-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 20px 10px;
		gap: 20px;
	}

	.pages {
		display: flex;
		gap: 10px;
		max-width: 600px;
		min-width: 0;
		overflow: auto;
		min-width: 0;
	}

	.page-link.active {
		background: var(--color-secondary);
	}

	.page-link {
		padding: 7px 14px;
		border-radius: 4px;
	}
</style>
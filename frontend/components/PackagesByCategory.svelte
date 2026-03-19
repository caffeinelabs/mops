<script lang="ts">
	import {onMount} from "svelte";
	import Loader from "./Loader.svelte";
	import PackageCard from "./package/PackageCard.svelte";
	import {PackageSummary} from "/declarations/main/main.did.js";
	import {mainActor} from "/logic/actors";
	import {getQualityPoints} from "/logic/get-quality-points";
	import Keywords from "./package/Keywords.svelte";

	let packagesByCategory : [string, PackageSummary[]][] = [];

	let loaded = false;
	let packages : PackageSummary[] = [];
	let categories : string[] = [];
	let selectedCategory = "";

	function selectCategory(category : string) {
		selectedCategory = category;
		packages = [];

		for (let [cat, pkgs] of packagesByCategory) {
			if (cat === category) {
				packages = pkgs.slice().sort((a, b) => {
					return getQualityPoints(b.quality).total - getQualityPoints(a.quality).total;
				}).slice(0, 8);
				break;
			}
		}
	}

	function getCategoryDescription(category : string) {
		if (category === "Data Structures") {
			return "Efficient collections and algorithms for data management";
		}
		if (category === "Utilities") {
			return "Helpful functions and tools for streamlined Motoko development";
		}
		if (category === "Encoding") {
			return "Tools for converting data formats";
		}
		if (category === "Cryptography") {
			return "Secure data handling with encryption and hashing techniques";
		}
		if (category === "Types/Interfaces") {
			return "Types and interfaces for seamless integration";
		}
		if (category === "HTTP") {
			return "Facilitate web communication with HTTP request/response handling";
		}
		if (category === "Async Data Flow") {
			return "Manage asynchronous operations and data streams";
		}
		if (category === "Databases") {
			return "Databases for persistent data storage";
		}
		if (category === "Stable Memory") {
			return "Manage data in persistent memory up to 400GB";
		}
		if (category === "ICRC") {
			return "Implementation of ICRC standards";
		}
		if (category === "DeFi") {
			return "Tools and protocols for decentralized finance";
		}
		if (category === "AI") {
			return "On-chain AI";
		}
		if (category === "Chain Fusion") {
			return "Interconnect with multiple blockchains in a decentralized manner (Bitcoin, Ethereum, Solana, etc.)";
		}
	}

	function getCategoryKeywords(category : string) {
		if (category === "Data Structures") {
			return ["data-structure"];
		}
		if (category === "Utilities") {
			return ["utils"];
		}
		if (category === "Encoding") {
			return ["encoding", "decoding"];
		}
		if (category === "Cryptography") {
			return ["crypto", "hash", "encryption"];
		}
		if (category === "Types/Interfaces") {
			return ["types", "interface", "service"];
		}
		if (category === "HTTP") {
			return ["http", "server", "web"];
		}
		if (category === "Async Data Flow") {
			return ["async", "data-flow"];
		}
		if (category === "Databases") {
			return ["database", "db"];
		}
		if (category === "Stable Memory") {
			return ["stable-memory", "memory", "region", "persistent"];
		}
		if (category === "ICRC") {
			return ["icrc"];
		}
		if (category === "DeFi") {
			return ["defi", "exchange"];
		}
		if (category === "AI") {
			return ["ai", "llm", "mcp"];
		}
		if (category === "Chain Fusion") {
			return ["chain-fusion", "threshold", "chain-key"];
		}
	}

	onMount(async () => {
		packagesByCategory = await mainActor().getPackagesByCategory();
		categories = packagesByCategory.map(([category, _]) => category);
		selectCategory(packagesByCategory[0][0]);
		loaded = true;
	});
</script>

<div class="packages-by-category">
	<div class="title">Packages by Category</div>
	<div class="body">
		{#if loaded}
			<div class="categories">
				{#each categories as category}
					<div class="category" class:selected={category === selectedCategory} on:click={() => selectCategory(category)}>{category}</div>
				{/each}
			</div>
			<div class="category-content">
				<div class="description">{getCategoryDescription(selectedCategory)}<Keywords keywords={getCategoryKeywords(selectedCategory)} /></div>
				<div class="packages">
					{#each packages as pkg}
						<div class="package">
							<PackageCard
								{pkg}
								showUpdated={false}
								showVersion={false}
							></PackageCard>
						</div>
					{:else}
						{#if loaded}
							<div class="not-found">Packages not found</div>
						{/if}
					{/each}
				</div>
			</div>
		{:else}
			<Loader></Loader>
		{/if}
	</div>
</div>

<style>
	.packages-by-category {
		padding: 0 40px;
		width: 900px;
		max-width: 100%;
		box-sizing: border-box;
	}

	.title {
		margin-bottom: 20px;
		font-size: 22px;
		font-weight: 600;
		text-align: center;
	}

	.body {
		display: flex;
		align-items: flex-start;
		gap: 30px;
		margin-bottom: 20px;
	}

	.categories {
		display: flex;
		flex-direction: column;
		margin-top: 10px;
	}

	.category.selected {
		background: var(--color-secondary);
	}

	.category {
		padding: 20px 20px;
		padding-right: 50px;
		font-size: 18px;
		font-weight: 500;
		user-select: none;
		display: flex;
		align-items: center;
		white-space: nowrap;
		min-width: 155px;
		cursor: pointer;
		border-bottom: 1px solid hsl(0deg 0% 90.66%);
	}

	.description {
		display: flex;
		/* align-items: baseline; */
		flex-direction: column;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 10px;
		padding: 10px;
		border-left: 4px solid lightgray;
		background: #f9f9f9;
		color: #202020;
		font-size: 15px;
	}

	.category-content {
		min-width: 0;
	}

	.packages {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		column-gap: 40px;
		padding: 0 40px;
		margin: 0 auto;
		padding: 0;
	}

	.package {
		min-width: 0;
	}

	@media (width < 700px) {
		.body {
			flex-wrap: wrap;
		}

		.categories {
			flex-direction: row;
			overflow: auto;
		}

		.category {
			min-width: auto;
			padding: 20px;
		}
	}
</style>
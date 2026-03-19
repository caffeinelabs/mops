<script lang="ts">
	import {onMount} from "svelte";
	import {mainActor} from "/logic/actors";

	let totalPackages : bigint;
	let totalDownloads : bigint;

	onMount(async () => {
		totalPackages = await mainActor().getTotalPackages();
		totalDownloads = await mainActor().getTotalDownloads();
	});
</script>

<div class="container">
	<div class="total">Total packages: <span class="count">{totalPackages?.toLocaleString() || "-"}</span></div>
	<div class="total">Total downloads: <span class="count">{totalDownloads?.toLocaleString() || "-"}</span></div>
</div>

<style>
	.total {
		font-size: 26px;
	}

	.count {
		font-size: 30px;
		font-family: sans-serif;
	}
</style>
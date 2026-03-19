<script lang="ts">
	import PackageBenchmark from "./PackageBenchmark.svelte";
	import {PackageDetails} from "/declarations/main/main.did.js";

	export let packageDetails : PackageDetails;
</script>

<div class="test-stats">
	{#if packageDetails.benchmarks.length === 0}
		<div>No benchmarks</div>
	{:else}
		<div class="meta">
			<div>{packageDetails.benchmarks[0].replica} {packageDetails.benchmarks[0].replicaVersion}, {packageDetails.benchmarks[0].compiler} {packageDetails.benchmarks[0].compilerVersion}, {packageDetails.benchmarks[0].gc} GC</div>
		</div>

		{#each packageDetails.benchmarks as benchmark}
			<PackageBenchmark {benchmark}></PackageBenchmark>
		{/each}
	{/if}
</div>

<style>
	.meta {
		color: gray;
	}
</style>
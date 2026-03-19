<script lang="ts">
	import {Benchmarks, Benchmark} from "/declarations/main/main.did.js";
	import PackageBenchmark from "./PackageBenchmark.svelte";
	import ColorizedValue from "../ColorizedValue.svelte";
	import {getMetricDiff} from "/logic/benchmark-utils";

	export let curBenchmarks : Benchmarks;
	export let prevBenchmarks : Benchmarks;

	type Metric = "instructions" | "rts_heap_size" | "rts_logical_stable_memory_size" | "rts_reclaimed";

	let pairs = curBenchmarks.map((cur) => [cur, prevBenchmarks.find((prev) => {
		return prev.file === cur.file;
	})]).filter((pair) => pair[1]);

	function computeDiff(cur : Benchmark, prev : Benchmark, metric : Metric) : number {
		let rows = cur.rows.filter((row) => prev.rows.includes(row));
		let cols = cur.cols.filter((col) => prev.cols.includes(col));

		let diff = 0;

		for (let row of rows) {
			for (let col of cols) {
				diff += getMetricDiff(cur, prev, row, col, metric);
			}
		}

		return diff / (rows.length * cols.length);
	}

	function computeDiffAll(cur : Benchmark, prev : Benchmark) : number {
		let metrics : Metric[] = ["instructions", "rts_heap_size", "rts_logical_stable_memory_size", "rts_reclaimed"];
		let diff = 0;

		for (let metric of metrics) {
			diff += computeDiff(cur, prev, metric);
		}

		return diff;
	}
</script>

<div class="container">
	{#each pairs as [cur, prev]}
		<details class="bench">
			<summary>
				<div class="bench-name">{cur.name} <ColorizedValue value={computeDiffAll(cur, prev)}></ColorizedValue></div>
			</summary>
			<div class="diff">
				<div class="bench-overall-diff">
					<div>Instructions: <ColorizedValue value={computeDiff(cur, prev, "instructions")}></ColorizedValue></div>
					<div>Heap: <ColorizedValue value={computeDiff(cur, prev, "rts_heap_size")}></ColorizedValue></div>
					<div>Garbage Collection: <ColorizedValue value={computeDiff(cur, prev, "rts_reclaimed")}></ColorizedValue></div>
					<div>Stable Memory: <ColorizedValue value={computeDiff(cur, prev, "rts_logical_stable_memory_size")}></ColorizedValue></div>
				</div>
				<PackageBenchmark benchmark={cur} otherBenchmark={prev}></PackageBenchmark>
			</div>
		</details>
	{/each}
</div>

<style>
	.container {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	summary {
		cursor: pointer;
	}

	.bench-overall-diff {
		margin-top: 6px;
		margin-bottom: 14px;
	}

	.diff {
		margin-top: 14px;
		margin-left: 16px;
	}

	.bench-name {
		display: inline-block;
	}
</style>
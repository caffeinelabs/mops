<script lang="ts">
	import {filesize} from "filesize";
	import {Benchmark} from "/declarations/main/main.did.js";
	import ColorizedValue from "../ColorizedValue.svelte";
	import {getMetricDiff, getMetricNum} from "/logic/benchmark-utils";

	export let benchmark : Benchmark;
	export let otherBenchmark : Benchmark | undefined = undefined;

	function getMetric(bench : Benchmark, row : string, col : string, metric : string) {
		let value = getMetricNum(bench, row, col, metric);

		if (value !== undefined) {
			if (metric === "instructions") {
				if (value > 100_000) {
					let decimals = 2;
					if (value > 100_000_000) {
						decimals = 0;
					}
					else if (value > 10_000_000) {
						decimals = 1;
					}
					return parseFloat((value / 1_000_000).toFixed(decimals)).toLocaleString("en-US").replaceAll(",", "_") + " M";
				}
				return value.toLocaleString("en-US").replaceAll(",", "_") ?? "-";
			}
			else if (metric === "rts_logical_stable_memory_size") {
				return filesize(value * 65536, {standard: "iec", round: 2});
			}
			return filesize(value, {standard: "iec", round: 2});
		}
		else {
			return "-";
		}
	}
</script>

<div class="test-stats">
	<div>
		{#if !otherBenchmark}
			<h2>{benchmark.name}</h2>
			<div>{benchmark.description}</div>
			<br>
		{/if}

		<b>Instructions</b>
		<table>
			<thead>
				<tr>
					<th></th>
					{#each benchmark.cols as col}
						<th>{col}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each benchmark.rows as row}
					<tr>
						<td>{row}</td>
						{#each benchmark.cols as col}
							<td>
								{#if otherBenchmark}
									<ColorizedValue value={getMetricDiff(benchmark, otherBenchmark, row, col, "instructions")}></ColorizedValue>
								{:else}
									{getMetric(benchmark, row, col, "instructions")}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<b>Heap</b>
		<table>
			<thead>
				<tr>
					<th></th>
					{#each benchmark.cols as col}
						<th>{col}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each benchmark.rows as row}
					<tr>
						<td>{row}</td>
						{#each benchmark.cols as col}
							<td>
								{#if otherBenchmark}
									<ColorizedValue value={getMetricDiff(benchmark, otherBenchmark, row, col, "rts_heap_size")}></ColorizedValue>
								{:else}
									{getMetric(benchmark, row, col, "rts_heap_size")}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<b>Garbage Collection</b>
		<table>
			<thead>
				<tr>
					<th></th>
					{#each benchmark.cols as col}
						<th>{col}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each benchmark.rows as row}
					<tr>
						<td>{row}</td>
						{#each benchmark.cols as col}
							<td>
								{#if otherBenchmark}
									<ColorizedValue value={getMetricDiff(benchmark, otherBenchmark, row, col, "rts_reclaimed")}></ColorizedValue>
								{:else}
									{getMetric(benchmark, row, col, "rts_reclaimed")}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<b>Stable Memory</b>
		<table>
			<thead>
				<tr>
					<th></th>
					{#each benchmark.cols as col}
						<th>{col}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each benchmark.rows as row}
					<tr>
						<td>{row}</td>
						{#each benchmark.cols as col}
							<td>
								{#if otherBenchmark}
									<ColorizedValue value={getMetricDiff(benchmark, otherBenchmark, row, col, "rts_logical_stable_memory_size")}></ColorizedValue>
								{:else}
									{getMetric(benchmark, row, col, "rts_logical_stable_memory_size")}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	table {
		margin-top: 6px;
	}

	td {
		white-space: nowrap;
	}
</style>
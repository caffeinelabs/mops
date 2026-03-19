<script lang="ts">
	import {Line} from "svelte-chartjs";
	import {Chart as ChartJS, LineElement, LinearScale, CategoryScale, TimeScale, PointElement, Filler} from "chart.js";
	import "chartjs-adapter-date-fns";
	import {DownloadsSnapshot} from "/declarations/main/main.did.js";

	ChartJS.register([LineElement, PointElement, LinearScale, CategoryScale, TimeScale, Filler]);

	export let snapshots : DownloadsSnapshot[] = [];
</script>

<div class="download-trend">
	{#if snapshots.length}
		<Line
			width={100}
			height={40}
			data={{
				datasets: [{
					// @ts-ignore
					data: snapshots.map((snapshot) => {
						return {
							x: new Date(Number(snapshot.startTime / 1_000_000n)),
							y: Number(snapshot.downloads),
						};
					}),
					// backgroundColor: window.getComputedStyle(document.body).getPropertyValue('--color-primary-light'),
					borderColor: window.getComputedStyle(document.body).getPropertyValue("--color-primary-light"),
					borderJoinStyle: "bevel",
					borderWidth: 2,
					fill: true,
					pointRadius: 0,
					pointHoverRadius: 0,
				}],
			}}
			options={{
				animation: false,
				layout: {
					padding: 0,
				},
				scales: {
					x: {
						display: false,
						type: "time",
						min: Math.min(Date.now() - 300 * 24 * 60 * 60 * 1_000, Number(snapshots[0].startTime / 1_000_000n)),
						time: {
							unit: "week",
						},
					},
					y: {
						beginAtZero: true,
						display: false,
					},
				},
				plugins: {
					tooltip: {
						enabled: false,
					},
					legend: {
						display: false,
					},
				},
			}}
		></Line>
	{/if}
</div>

<style>
	.download-trend {
		border-bottom: 1px solid var(--color-primary-light);
	}
</style>
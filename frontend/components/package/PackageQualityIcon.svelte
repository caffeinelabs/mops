<script lang="ts">
	import {PackageSummary} from "/declarations/main/main.did.js";
	import {getQualityPoints} from "/logic/get-quality-points";

	export let pkg : PackageSummary;

	let maxBasePoints = 6;
	let maxExtraPoints = 4;

	let outerCircleDashOffset = 0;
	let innerLineY = 0;

	$: {
		let points = getQualityPoints(pkg.quality);

		function convertRange(value : number, r1 : [number, number], r2 : [number, number]) {
			return (value - r1[0]) * (r2[1] - r2[0]) / (r1[1] - r1[0]) + r2[0];
		}

		outerCircleDashOffset = convertRange(maxBasePoints - points.base, [0, maxBasePoints], [18, 100]);
		innerLineY = convertRange(maxExtraPoints - points.extra, [0, maxExtraPoints], [13, 30]);
	}
</script>

<svg class="quality-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
	<line class="inner-line" x1="20" y1="30" x2="20" y2={innerLineY} stroke="var(--color-primary)" stroke-width="20"></line>
	<circle class="outer-circle-bg" cx="20" cy="20" r="13" fill="none" stroke="var(--color-secondary)" stroke-width="12"></circle>
	<circle class="outer-circle" class:full={outerCircleDashOffset == 18} cx="20" cy="20" r="13" fill="none" stroke="var(--color-primary)" stroke-width="12" stroke-dasharray="100 100" stroke-dashoffset={outerCircleDashOffset}></circle>
</svg>

<style>
	.quality-icon {
		width: 13px;
	}

	.outer-circle-bg {
		opacity: 0.7;
	}

	.outer-circle {
		transform: rotate(-90deg);
		transform-origin: center;
	}
</style>
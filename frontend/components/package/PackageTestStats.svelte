<script lang="ts">
	import PackageTestStatsLine from "./PackageTestStatsLine.svelte";
	import {PackageDetails} from "/declarations/main/main.did.js";

	export let packageDetails : PackageDetails;

	type NestedStats = { [key : string] : NestedStats | boolean };

	function createNestedStats(lines : string[]) : NestedStats {
		const result : NestedStats = {};

		lines.forEach(line => {
			const parts = line.split(" › ");
			let currentObj : NestedStats = result;

			parts.forEach((part, index) => {
				if (!currentObj[part]) {
					currentObj[part] = {};
				}
				if (index === parts.length - 1) {
					currentObj[part] = false;
				}
				else {
					currentObj = currentObj[part] as NestedStats;
				}
			});
		});

		return result;
	}

	let nestedStats = createNestedStats(packageDetails.testStats.passedNames);
</script>

<PackageTestStatsLine {packageDetails} {nestedStats}></PackageTestStatsLine>
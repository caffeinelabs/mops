<script lang="ts">
	import {link} from "svelte-spa-history-router";
	import {formatDistanceStrict} from "date-fns";
	import DateEl from "../Date.svelte";

	import {PackageSummary} from "/declarations/main/main.did.js";
	import PackageQualityIcon from "./PackageQualityIcon.svelte";

	export let pkg : PackageSummary;
	export let showVersion = false;
	export let showFirstPublished = false;
	export let showUpdated = false;
	export let showDownloads = false;
	export let show7DayDownloads = false;
	export let showLatestVersion = false;
	export let showDependsOn = "";

	let status : "latest" | "update-available" | "outdated" = "latest";
	let howOld = "";
	let dependsOnVersion = "";

	$: if (pkg.config.version !== pkg.highestVersion) {
		let pubTime = Number(pkg.publication.time / 1_000_000n);
		status = pubTime < Date.now() - 1000 * 60 * 60 * 24 * 30 * 6 ? "outdated" : "update-available";
		howOld = formatDistanceStrict(pubTime, Date.now()) + " old";
	}

	$: if (showDependsOn) {
		dependsOnVersion = [...pkg.config.dependencies, ...pkg.config.devDependencies].find(dep => dep.name.split("@")[0] == showDependsOn)?.version ?? "";
	}
</script>

<div class="package">
	<div class="summary">
		<div class="left">
			<div class="header">
				<div class="quality-icon">
					<PackageQualityIcon pkg={pkg}></PackageQualityIcon>
				</div>
				<a class="name" href="/{pkg.config.name}" use:link>{pkg.depAlias || pkg.config.name}</a>
				<div class="version">{pkg.config.version}</div>
			</div>
		</div>
		<div class="right">
			{#if showVersion}
				<div>Version {pkg.config.version}</div>
			{/if}
			{#if showLatestVersion}
				{#if status !== "latest"}
					<div class="{status}">{howOld}</div>
					<div>Latest: {pkg.highestVersion}</div>
				{/if}
			{/if}
			{#if showDependsOn && dependsOnVersion}
				<div>Depends on: {dependsOnVersion}</div>
			{/if}
			{#if showUpdated}
				<div>Updated <DateEl date="{Number(pkg.publication.time / 1000000n)}"></DateEl></div>
			{/if}
			{#if showFirstPublished}
				<div><DateEl date="{Number(pkg.publication.time / 1000000n)}"></DateEl></div>
			{/if}
			{#if show7DayDownloads}
				<div>Downloads: {pkg.downloadsInLast7Days.toLocaleString()}</div>
			{/if}
			{#if showDownloads}
				<div>Downloads: {pkg.downloadsTotal.toLocaleString()}</div>
			{/if}
		</div>
	</div>
	<div class="description">{pkg.config.description}</div>
</div>

<style>
	.package {
		display: flex;
		flex-direction: column;
		padding: 17px;
		box-sizing: border-box;
		width: 600px;
		max-width: 100%;
		gap: 10px;
		border-bottom: 1px solid var(--color-secondary);
	}

	.summary {
		display: flex;
	}

	.left {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.quality-icon {
		opacity: 0.6;
	}

	.name {
		font-size: 20px;
		font-weight: 500;
		cursor: pointer;
		word-break: break-word;
	}

	.version {
		font-size: 12px;
		display: none;
	}

	.description {
		font-size: 15px;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.right {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		color: rgb(170, 170, 170);
		text-align: right;
		white-space: nowrap;
	}

	.update-available {
		color: #d4930f;
	}

	.outdated {
		color: #9f1616;
	}
</style>
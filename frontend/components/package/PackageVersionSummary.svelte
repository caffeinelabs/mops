<script lang="ts">
	import {link} from "svelte-spa-history-router";

	import {DepChange, PackageSummaryWithChanges} from "/declarations/main/main.did.js";
	import {markdownToHtml} from "/logic/markdown-to-html";
	import {getDocsCoverageColor} from "/logic/get-docs-coverage-color.js";
	import Date from "../Date.svelte";
	import PackageBenchmarksDiff from "./PackageBenchmarksDiff.svelte";
	import UserCard from "./UserCard.svelte";

	export let summary : PackageSummaryWithChanges;
	export let showName = false;

	let url = showName ? `/${summary.config.name}` : `/${summary.config.name}@${summary.config.version}`;

	let dd : [string, DepChange[]][] = [["Dependencies", summary.changes.deps], ["Dev Dependencies", summary.changes.devDeps]];
</script>

<div class="version-summary" class:show-name={showName}>
	<div class="header">
		<a class="link" href={url} use:link>
			<div class="name">{summary.config.name}</div>
			<div class="version">{summary.config.version}</div>
		</a>
		<div class="version-published"><Date date="{Number(summary.publication.time / 1000000n)}"></Date></div>
	</div>
	{#if summary.changes.notes}
		<div class="title">📄 Release notes</div>
		<div class="notes">
			{#await markdownToHtml(summary.changes.notes, summary.config.repository)}
				Loading...
			{:then html}
				{@html html}
			{/await}
		</div>
	{/if}

	{#each dd as item}
		{#if item[1].length > 0}
			<div class="title">📦 {item[0]}</div>
			<ul class="deps">
				{#each item[1] as dep}
					<li class="dependency">
						{#if !dep.oldVersion}
							Added <a href="/{dep.name}" use:link>{dep.name}</a> {dep.newVersion}
						{:else if !dep.newVersion}
							Removed <a href="/{dep.name}" use:link>{dep.name}</a> <span class="old-version">{dep.oldVersion}</span>
						{:else}
							Updated <a href="/{dep.name}" use:link>{dep.name}</a> <span class="old-version">{dep.oldVersion}</span> ➜ {dep.newVersion}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/each}

	{#if summary.changes.tests.addedNames.length > 0 || summary.changes.tests.removedNames.length > 0}
		<div class="title">🧪 Tests
			<span class="added-tests" class:zero="{summary.changes.tests.addedNames.length == 0}">+{summary.changes.tests.addedNames.length}</span>
			/ <span class="removed-tests" class:zero="{summary.changes.tests.removedNames.length == 0}">-{summary.changes.tests.removedNames.length}</span>
		</div>
	{/if}

	{#if summary.changes.curBenchmarks.length && summary.changes.prevBenchmarks.length}
		<div class="title">🔬 Benchmarks</div>
		<div class="benchmarks">
			<PackageBenchmarksDiff curBenchmarks={summary.changes.curBenchmarks} prevBenchmarks={summary.changes.prevBenchmarks}></PackageBenchmarksDiff>
		</div>
	{/if}

	{#if summary.changes.curDocsCoverage != summary.changes.prevDocsCoverage}
		<div class="title">📚 Documentation
			<span class="docs-coverage">
				<span class="prev" style="color: {getDocsCoverageColor(summary.changes.prevDocsCoverage, true)}">{summary.changes.prevDocsCoverage.toFixed(0)}%</span> <span class="arrow">➜</span> <span class="cur" style="color: {getDocsCoverageColor(summary.changes.curDocsCoverage, true)}">{summary.changes.curDocsCoverage.toFixed(0)}%</span>
			</span>
		</div>
	{/if}

	<div class="publisher">
		Published by <UserCard user={summary.publisher} compact></UserCard>
	</div>
</div>

<style>
	.version-summary {
		margin-bottom: 10px;
		padding-bottom: 30px;
		border-bottom: 1.5px dashed lightgray;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
	}

	.link {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}

	.publisher {
		display: flex;
		gap: 4px;
		margin-top: 25px;
		font-size: 14px;
		white-space: nowrap;
	}

	.version-summary:not(.show-name) .name {
		display: none;
	}

	.version-summary:not(.show-name) .version {
		font-size: 24px;
	}

	.version-summary.show-name .name {
		font-size: 24px;
	}

	.version-summary.show-name .version {
		/* font-weight: 100; */
	}

	.title {
		margin-top: 25px;
		font-size: 20px;
		font-weight: 500;
	}

	.notes {
		line-height: 1.55;
	}

	:global(.version-summary .notes > :not(ul, ol)) {
		padding-left: 20px;
	}

	.dependency {
		word-break: break-word;
	}

	.old-version {
		color: gray;
		text-decoration: line-through;
	}

	.docs-coverage {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 18px;
	}

	.docs-coverage .arrow {
		font-size: 12px;
		font-weight: 100;
	}

	.docs-coverage .prev {
		opacity: 0.6;
		text-decoration: line-through;
	}

	.docs-coverage .cur {
		font-weight: 600;
	}

	.added-tests {
		color: rgb(6, 136, 6);
	}

	.removed-tests {
		color: rgb(197, 13, 13);
	}

	.zero {
		color: inherit;
	}
</style>
<script lang="ts">
	import {markdownToHtml} from "$lib/markdown-to-html";
	import {filesize} from "filesize";

	import releasesJson from "../../../releases.json";
	import Header from "../components/Header.svelte";
	import Install from "../components/Install.svelte";

	let releases = Object.entries(releasesJson.versions).sort(([_, a], [__, b]) => b.time - a.time);
</script>

<svelte:head>
	<title>Mops CLI Releases</title>
</svelte:head>

<Header></Header>

<Install></Install>

<div class="releases">
	{#each releases as [version, release]}
		<div class="release">
			<h2>{version}</h2>
			<div class="meta">
				{new Date(release.time).toISOString().split("T")[0]}
				<span class="bullet">•</span>
				{filesize(release.size, {standard: "iec", round: 0})}
			</div>
			<div class="meta hashes">
				{#if "commitHash" in release}
					<div class="hash">
						Commit hash: <a href="https://github.com/caffeinelabs/mops/commit/{release.commitHash}" target="_blank">{release.commitHash}</a>
					</div>
				{/if}
				<div class="hash">Build hash: {release.hash}</div>
			</div>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<p class="release-notes">{@html markdownToHtml(release.relseaseNotes)}</p>
		</div>
	{/each}
</div>

<style>
	h2 {
		margin-bottom: 0.5rem;
	}

	.releases {
		max-width: 990px;
		margin: 60px auto;
		padding: 0 20px;
	}

	.release {
		margin-bottom: 2.5rem;
	}

	.meta {
		display: flex;
		gap: 0.5rem;
		color: gray;
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
		white-space: nowrap;
	}

	.meta.hashes {
		flex-direction: column;
	}

	.release-notes {
		line-height: 1.55;
	}

	.hash {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
<script lang="ts">
	import {filesize} from "filesize";
	import {DepsStatus, PackageDetails} from "/declarations/main/main.did.js";
	import {getDocsCoverageColor} from "/logic/get-docs-coverage-color.js";
	import DownloadTrend from "../DownloadTrend.svelte";
	import githubImg from "/img/github.svg";
	import BadgesModal from "./BadgesModal.svelte";
	import PackageQualityIcon from "./PackageQualityIcon.svelte";
	import UserCard from "./UserCard.svelte";

	export let packageDetails : PackageDetails;
	let badgesModalActive = false;

	function showBadgesModal(e : MouseEvent) {
		e.preventDefault();
		badgesModalActive = true;
	}

	function depsStatusText(depsStatus : DepsStatus) : string {
		if ("allLatest" in depsStatus) {
			return "Up to Date";
		}
		else if ("updatesAvailable" in depsStatus) {
			return "Updates Available";
		}
		else if ("tooOld" in depsStatus) {
			return "Outdated";
		}
	}
</script>

<div class="right-panel">
	<div class="downloads">
		<div class="detail">
			<div class="label">Downloads</div>
			<div class="value">{packageDetails.downloadsTotal.toLocaleString()}</div>
		</div>
		<DownloadTrend snapshots={packageDetails.downloadTrend}></DownloadTrend>
	</div>
	{#if packageDetails.config.repository}
		<div class="detail">
			<div class="label">Repository</div>
			<a class="value with-icon" href="{packageDetails.config.repository.replace(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/(.+)$/, "$1/tree/main/$2")}" target="_blank">
				<img class="github-icon" src="{githubImg}" alt="GitHub logo" loading="lazy" />
				{packageDetails.config.repository.replace(/https?:\/\/(www\.)?(github\.com\/)?/, "")}
			</a>
		</div>
	{/if}
	{#if packageDetails.config.license}
		<div class="detail">
			<div class="label">License</div>
			<a class="value" href="https://spdx.org/licenses/{packageDetails.config.license}.html" target="_blank">{packageDetails.config.license}</a>
		</div>
	{/if}
	{#if packageDetails.fileStats.sourceSize}
		<div class="detail-row">
			<div class="detail">
				<div class="label">Size</div>
				{filesize(Number(packageDetails.fileStats.sourceSize), {standard: "iec", round: 1})}
			</div>
			<div class="detail">
				<div class="label">Files</div>
				{packageDetails.fileStats.sourceFiles}
			</div>
		</div>
	{/if}
	{#if packageDetails.config.requirements.length}
		<div class="detail">
			<div class="label">Requirements</div>
			{#each packageDetails.config.requirements as req}
				<div class="sub-row"><span>{req.name}</span> <span>{req.value}</span></div>
			{/each}
		</div>
	{/if}

	<div class="detail">
		<div class="label">Owners</div>
		<div class="owners">
			{#each packageDetails.owners as owner}
				<UserCard user={owner}></UserCard>
			{/each}
		</div>
	</div>

	{#if packageDetails.maintainers.length}
		<div class="detail">
			<div class="label">Maintainers</div>
			<div class="owners">
				{#each packageDetails.maintainers as maintainer}
					<UserCard user={maintainer}></UserCard>
				{/each}
			</div>
		</div>
	{/if}

	<div class="docs-links">
		<div><span class="question-mark">?</span> <a class="docs-link" href="https://docs.mops.one/package-owners-and-maintainers">Owners and maintainers</a></div>
		<div><span class="question-mark">?</span> <a class="docs-link" href="https://docs.mops.one/cli/mops-user-set">How to fill user info</a></div>
	</div>

	<div class="quality">
		<div class="label">
			<div>Package Quality</div>
			<PackageQualityIcon pkg={packageDetails}></PackageQualityIcon>
		</div>

		<div class="sub-row">
			<div class="quality-label">Dependencies</div>
			<div class="quality-value" data-deps-status={Object.keys(packageDetails.quality.depsStatus)[0]}>{depsStatusText(packageDetails.quality.depsStatus)}</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">Documentation</div>
			<div class="quality-value base-quality" style="color: {getDocsCoverageColor(packageDetails.quality.docsCoverage)}">{packageDetails.quality.docsCoverage.toFixed(0)}%</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">Description</div>
			<div class="quality-value base-quality" data-yes={packageDetails.quality.hasDescription}>{packageDetails.quality.hasDescription ? "Yes" : "No"}</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">Keywords</div>
			<div class="quality-value base-quality" data-yes={packageDetails.quality.hasKeywords}>{packageDetails.quality.hasKeywords ? "Yes" : "No"}</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">License</div>
			<div class="quality-value base-quality" data-yes={packageDetails.quality.hasLicense}>{packageDetails.quality.hasLicense ? "Yes" : "No"}</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">Repository</div>
			<div class="quality-value base-quality" data-yes={packageDetails.quality.hasRepository}>{packageDetails.quality.hasRepository ? "Yes" : "No"}</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">Release Notes</div>
			<div class="quality-value extra-quality" data-yes={packageDetails.quality.hasReleaseNotes}>{packageDetails.quality.hasReleaseNotes ? "Yes" : "No"}</div>
		</div>

		<div class="sub-row">
			<div class="quality-label">Tests</div>
			<div class="quality-value extra-quality" data-yes={packageDetails.quality.hasTests}>{packageDetails.quality.hasTests ? "Yes" : "No"}</div>
		</div>
	</div>

	<a class="badges-button" on:click={showBadgesModal}>Badges</a>
</div>

<BadgesModal bind:active={badgesModalActive} packageName={packageDetails.config.name}></BadgesModal>

<style>
	.right-panel {
		width: 240px;
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	.downloads {
		display: flex;
		align-items: flex-end;
		gap: 5px;
		justify-content: space-between;
	}

	.detail-row {
		display: flex;
		gap: 50px;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.label {
		font-weight: bold;
		color: #303030;
	}

	.value {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.value.with-icon {
		display: flex;
		align-items: center;
		line-height: 1;
		gap: 5px;
		white-space: normal;
	}

	.github-icon {
		width: 20px;
		height: 20px;
		filter: hue-rotate(45deg) contrast(0.6);
	}

	.owners {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.question-mark {
		font-size: 14px;
		color: gray;
	}

	.docs-links {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.docs-link {
		font-size: 14px;
		opacity: 0.8;
	}

	/* quality */
	.quality {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.quality > .label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 5px;
	}

	.sub-row {
		display: flex;
		justify-content: space-between;
		/* padding-left: 5px; */
	}

	.quality-value {
		text-transform: lowercase;
	}

	.quality-value[data-yes=true],
	.quality-value[data-deps-status=allLatest] {
		color: var(--color-quality-good);
	}

	.quality-value[data-deps-status=updatesAvailable] {
		color: var(--color-quality-medium);
	}

	.quality-value.base-quality[data-yes=false],
	.quality-value[data-deps-status=tooOld] {
		color: var(--color-quality-bad);
	}

	.badges-button {
		cursor: pointer;
		text-decoration: underline dotted;
		margin-top: 20px;
	}

	@media (max-width: 750px) {
		.right-panel {
			margin-left: 20px;
			margin-bottom: 20px;
		}
	}
</style>
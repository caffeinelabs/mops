<script lang="ts">
	import {onMount} from "svelte";
	import {debounce} from "throttle-debounce";
	import {currentURL, routeParams, push, link} from "svelte-spa-history-router";
	import {getFileIds} from "ic-mops/api/downloadPackageFiles";

	import {PackageDetails, PackageSummary, PackageSummaryWithChanges} from "/declarations/main/main.did.js";
	import {mainActor, storageActor} from "/logic/actors";

	import Header from "../Header.svelte";
	import Loader from "../Loader.svelte";
	import Date from "../Date.svelte";
	import NotFound from "../NotFound.svelte";
	import Footer from "../Footer.svelte";
	import PackageCard from "./PackageCard.svelte";
	import PackageReadme from "./PackageReadme.svelte";
	import PackageCode from "./PackageCode.svelte";
	import PackageDocs from "./PackageDocs.svelte";
	import PackageRightPanel from "./PackageRightPanel.svelte";
	import githubImg from "/img/github.svg";
	import {compareVersions} from "/logic/compare-versions";
	import PackageVersionSummary from "./PackageVersionSummary.svelte";
	import PackageTestStats from "./PackageTestStats.svelte";
	import PackageBenchmarks from "./PackageBenchmarks.svelte";
	import Keywords from "./Keywords.svelte";

	let pkgName : string;
	$: pkgName = $routeParams.packageName;
	$: pkgVersion = $routeParams.version;
	$: $currentURL && load();
	$: command = `mops add ${packageDetails?.config.name}${getHighestVersion() !== packageDetails?.config.version ? "@" + packageDetails?.config.version : ""}`;

	let readme : string;
	let fileIds : string[];
	let docsData : Uint8Array;
	let packageDetails : PackageDetails;
	let loaded = false;
	let installHovered = false;
	let copiedToClipboard = false;

	function getHighestVersion() {
		return packageDetails?.versionHistory.map(a => a.config.version).sort(compareVersions).at(-1);
	}

	$: githubDeps = packageDetails?.config.dependencies.filter(dep => dep.repo);

	let load = debounce(10, async () => {
		let sameVersion = (pkgVersion || getHighestVersion()) === packageDetails?.config.version;
		if (!pkgName || loaded && pkgName === packageDetails?.config.name && sameVersion) {
			return;
		}
		loaded = false;

		let ver = pkgVersion || "highest";
		let packageDetailsRes = await mainActor().getPackageDetails(pkgName, ver);
		if ("ok" in packageDetailsRes) {
			packageDetails = packageDetailsRes.ok;
		}
		else {
			packageDetails = null;
			loaded = true;
			return;
		}

		let downloadReadme = async () => {
			let res = await storageActor(packageDetails.publication.storage).downloadChunk(`${packageDetails.config.name}@${packageDetails.config.version}/${packageDetails.config.readme}`, 0n);
			if ("ok" in res) {
				readme = new TextDecoder().decode(new Uint8Array(res.ok));
			}
			else {
				readme = "*Not found README.md*";
			}
		};

		let downloadDocs = async () => {
			let docsRes = await storageActor(packageDetails.publication.storage).downloadChunk(`${packageDetails.config.name}@${packageDetails.config.version}/docs.tgz`, 0n);
			if ("ok" in docsRes) {
				docsData = new Uint8Array(docsRes.ok);
			}
			else {
				docsData = null;
			}
		};

		let downloadCode = async () => {
			window.MOPS_NETWORK = process.env.DFX_NETWORK;
			fileIds = await getFileIds(packageDetails.config.name, packageDetails.config.version);
		};

		await Promise.all([downloadReadme(), downloadDocs(), downloadCode()]);

		loaded = true;
	});

	let installHoverTimer : any;
	function installMouseenter() {
		clearTimeout(installHoverTimer);
		installHoverTimer = setTimeout(() => {
			installHovered = true;
		}, 600);
	}

	function installMouseleave() {
		clearTimeout(installHoverTimer);
		if (!copiedToClipboard) {
			installHovered = false;
		}
	}

	let resetIconTimer : any;
	function copyCommand() {
		navigator.clipboard.writeText(command);
		copiedToClipboard = true;
		installHovered = true;
		clearTimeout(resetIconTimer);
		resetIconTimer = setTimeout(() => {
			installHovered = false;
			setTimeout(() => {
				copiedToClipboard = false;
			}, 300);
		}, 3000);
	}

	$: selectedTab = $routeParams.tab || "";
	function selectTab(tab : string) {
		let path = `/${$routeParams.packageId}`;
		if (tab) {
			path += `/${tab}`;
		}
		push(path);
	}

	function isTabSelected(tab : string, selectedTab : string) : boolean {
		return selectedTab == tab;
	}

	let versionHistory : PackageSummaryWithChanges[] = null;
	$: {
		if (selectedTab == "versions" && !versionHistory) {
			mainActor().getPackageVersionHistory(pkgName).then(res => {
				versionHistory = res;
			});
		}
	}

	let dependents : PackageSummary[] = null;
	$: {
		if (selectedTab == "dependents" && !dependents) {
			mainActor().getPackageDependents(pkgName, 500n, 0n).then(res => {
				dependents = res[0];
			});
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>{packageDetails ? `${packageDetails.config.name} • Motoko Package` : "Motoko Package"}</title>
</svelte:head>

<Header></Header>

<div class="package">
	{#if loaded}
		{#if packageDetails}
			<div class="header">
				<div class="header-content">
					<div class="name">{packageDetails.config.name}</div>
					<div class="version">{packageDetails.config.version} published <Date date="{Number(packageDetails.publication.time / 1000000n)}"></Date></div>
					{#if getHighestVersion() !== packageDetails.config.version}
						<div>
							<a class="new-version-available" href="/{pkgName}" use:link>Newer version available: {getHighestVersion()}</a>
						</div>
					{/if}
					<div class="description">{packageDetails.config.description}</div>

					<div class="install">
						<div class="command-container" class:hover="{installHovered}" on:mouseenter="{installMouseenter}" on:mouseleave="{installMouseleave}">
							<div class="text" on:click="{copyCommand}">Install</div>
							<div class="command" on:click="{copyCommand}">{command}</div>
						</div>
						<div class="clipboard-text">{copiedToClipboard ? "Copied to clipboard!" : "Click to copy to clipboard"}</div>
					</div>

					<Keywords keywords={packageDetails.config.keywords} />
				</div>
			</div>

			<!-- tabs -->
			<div class="tabs">
				<div class="tab" class:selected={isTabSelected("code", selectedTab)} on:click={() => selectTab("code")} on:keydown={(e) => e.key === "Enter" && selectTab("code")} tabindex="0" role="tab">Code</div>
				<div class="tab" class:selected={isTabSelected("docs", selectedTab)} on:click={() => selectTab("docs")} on:keydown={(e) => e.key === "Enter" && selectTab("docs")} tabindex="0" role="tab">Docs</div>
				<div class="tab" class:selected={isTabSelected("", selectedTab)} on:click={() => selectTab("")} on:keydown={(e) => e.key === "Enter" && selectTab("")} tabindex="0" role="tab">Readme</div>
				<div class="tab" class:selected={isTabSelected("versions", selectedTab)} on:click={() => selectTab("versions")} on:keydown={(e) => e.key === "Enter" && selectTab("versions")} tabindex="0" role="tab">Versions ({packageDetails.versions.length})</div>
				<div class="tab" class:selected={isTabSelected("dependencies", selectedTab)} on:click={() => selectTab("dependencies")} on:keydown={(e) => e.key === "Enter" && selectTab("dependencies")} tabindex="0" role="tab">Dependencies ({packageDetails.deps.length + githubDeps.length})</div>
				<div class="tab" class:selected={isTabSelected("dependents", selectedTab)} on:click={() => selectTab("dependents")} on:keydown={(e) => e.key === "Enter" && selectTab("dependents")} tabindex="0" role="tab">Dependents ({packageDetails.dependentsCount})</div>
				<div class="tab" class:selected={isTabSelected("tests", selectedTab)} on:click={() => selectTab("tests")} on:keydown={(e) => e.key === "Enter" && selectTab("tests")} tabindex="0" role="tab">Tests ({packageDetails.testStats.passed})</div>
				<div class="tab" class:selected={isTabSelected("benchmarks", selectedTab)} on:click={() => selectTab("benchmarks")} on:keydown={(e) => e.key === "Enter" && selectTab("benchmarks")} tabindex="0" role="tab">Benchmarks ({packageDetails.benchmarks.length})</div>
			</div>

			<div class="body">
				{#if selectedTab == "code"}
					<div class="layout-wide">
						<PackageCode {packageDetails} {fileIds}></PackageCode>
					</div>
				{:else if selectedTab == "docs"}
					<div class="layout-wide">
						{#if docsData}
							<PackageDocs docsData={docsData}></PackageDocs>
						{:else}
							<div class="no-docs">No documentation found</div>
						{/if}
					</div>
				{:else}
					<div class="layout-compact">
						<div class="middle">
							{#if selectedTab == ""}
								<PackageReadme readme={readme} repository={packageDetails.config.repository}></PackageReadme>
							{:else if selectedTab == "versions"}
								<div class="packages">
									{#each (versionHistory || packageDetails.versionHistory) as versionSummary}
										<PackageVersionSummary summary={versionSummary}></PackageVersionSummary>
									{/each}
								</div>
							{:else if selectedTab == "dependencies"}
								<h3 class="deps">Dependencies</h3>
								<div class="packages">
									{#each packageDetails.deps as pkg}
										<PackageCard {pkg} showVersion={true} showLatestVersion={true} />
									{/each}
								</div>
								{#if packageDetails.devDeps.length}
									<h3 class="dev-deps">Dev Dependencies</h3>
									<div class="packages">
										{#each packageDetails.devDeps as pkg}
											<PackageCard {pkg} showVersion={true} />
										{/each}
									</div>
								{/if}
								{#if githubDeps.length}
									<h3 class="github-deps">GitHub Dependencies</h3>
									<div class="packages">
										{#each githubDeps as dep}
											<div class="github-dep">
												<div class="github-dep-name">{dep.name}</div>
												<a class="github-dep-repo" href="{dep.repo}" target="_blank">
													<img class="github-icon" src="{githubImg}" alt="GitHub logo" loading="lazy" />
													<div>{dep.repo.replace(/https?:\/\/(www\.)?(github\.com\/)?/, "").split("#")[0]}</div>
												</a>
												<div class="github-dep-tag">{dep.repo.split("#")[1] || ""}</div>
											</div>
										{/each}
									</div>
								{/if}
							{:else if selectedTab == "dependents"}
								<div class="packages">
									{#each (dependents || packageDetails.dependents) as pkg}
										<PackageCard {pkg} showDownloads={true} showDependsOn={packageDetails.config.name} />
									{/each}
								</div>
							{:else if selectedTab == "tests"}
								<div class="tests">
									<PackageTestStats {packageDetails}></PackageTestStats>
								</div>
							{:else if selectedTab == "benchmarks"}
								<div class="benchmarks">
									<PackageBenchmarks {packageDetails}></PackageBenchmarks>
								</div>
							{/if}
						</div>
						<div class="right">
							<PackageRightPanel {packageDetails}></PackageRightPanel>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div class="not-found">
				<NotFound>Package "{pkgName}" not found</NotFound>
			</div>
		{/if}
	{:else}
		<Loader></Loader>
	{/if}
</div>

<Footer />

<style>
	.package {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 20px;
	}

	.not-found {
		margin-top: 20px;
	}

	.header {
		display: flex;
		justify-content: center;
		width: 100%;
		background: var(--color-secondary);
	}

	.header .name {
		font-size: 35px;
		font-weight: 500;
	}

	.header .version {
		font-size: 14px;
	}

	.description {
		display: inline-block;
		margin-top: 10px;
		padding: 10px;
		border-radius: 3px;
		background: #c9cec3;
		color: #202020;
		font-size: 15px;
	}

	.header-content {
		width: 900px;
		padding: 20px;
		box-sizing: border-box;
		min-width: 0;
	}

	.header .install {
		display: flex;
		padding: 0px;
		align-items: center;
		margin: 10px 0;
	}

	.header .install .command-container {
		display: flex;
	}

	.header .install .text {
		font-weight: 500;
		padding: 10px;
		background: #7c865942;
		height: 41px;
		box-sizing: border-box;
		cursor: pointer;
	}

	.header .install .command {
		display: flex;
		align-items: center;
		height: 41px;
		box-sizing: border-box;
		border: 2px solid #7c865942;
		font-family: monospace;
		font-size: 18px;
		padding: 0 11px;
		white-space: nowrap;
		cursor: pointer;
	}

	.header .command-container.hover + .clipboard-text {
		opacity: 1;
	}

	.header .install .clipboard-text {
		margin-left: 8px;
		font-size: 14px;
		font-style: italic;
		color: rgb(100, 100, 100);
		opacity: 0;
		transition: opacity 0.3s;
		pointer-events: none;
		user-select: none;
	}

	.tabs {
		/* position: sticky;
		top: 70px;
		background: white;
		z-index: 10; */

		display: flex;
		overflow: auto;
		width: 100%;
		flex-shrink: 0;
		max-width: 1280px;
		margin-top: 25px;
	}

	.tab {
		padding: 10px 20px;
		border-bottom: 1px solid var(--color-primary);
		background: white;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		flex-grow: 1;
		flex-basis: 0;
		text-align: center;
	}

	.tab.selected {
		background: var(--color-secondary);
	}

	.packages {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.github-dep {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 20px;
		margin-right: 30px;
	}

	.github-dep-repo {
		display: flex;
		margin-left: auto;
		gap: 5px;
		white-space: nowrap;
	}

	.github-dep-name {
		white-space: nowrap;
	}

	.body {
		display: flex;
		justify-content: center;
		margin-top: 20px;
		width: 100%;
	}

	.layout-compact {
		display: flex;
		max-width: 900px;
		flex-grow: 1;
		min-width: 0;
	}

	.layout-compact .middle {
		flex-grow: 1;
		background: white;
		padding: 20px;
		padding-top: 0;
		min-width: 0;
		word-break: break-word;
	}

	.layout-wide {
		display: flex;
		max-width: 1280px;
		flex-grow: 1;
		min-width: 0;
	}

	.github-icon {
		width: 20px;
		height: 20px;
		filter: hue-rotate(45deg) contrast(0.6);
	}

	.no-docs {
		margin: auto;
	}

	h3.dev-deps, h3.github-deps {
		margin-top: 40px;
	}

	@media (max-width: 750px) {
		.layout-compact {
			flex-wrap: wrap;
		}
	}
</style>
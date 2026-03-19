<script lang="ts">
	import {link} from "svelte-spa-history-router";
	import Header from "./Header.svelte";
	import TopPackages from "./TopPackages.svelte";
	import Footer from "./Footer.svelte";
	import TotalStats from "./TotalStats.svelte";
	import PackagesByCategory from "./PackagesByCategory.svelte";
	import mopsImg from "/img/mops-motoko.svg";
	import motokoImg from "/img/motoko.svg";
	import RecentlyUpdatedPackages from "./RecentlyUpdatedPackages.svelte";
</script>

<svelte:head>
	<title>Mops • Motoko Package Manager</title>
</svelte:head>

<div class="main">
	<Header></Header>

	<div class="content">

		<div class="section">
			<img src="{mopsImg}" alt="mops logo" style="width: 100px;">
			<div class="text">
				<div class="description"><b>Mops</b> is a package manager for Motoko with fully on-chain package registry.</div>
			</div>

			<div class="getting-started">
				<div class="buttons">
					<a class="button" href="https://docs.mops.one/quick-start">Documentation</a>
					<a href="https://cli.mops.one">CLI Releases</a>
				</div>
			</div>
		</div>

		<div class="delimiter"></div>

		<TotalStats></TotalStats>

		<div class="delimiter"></div>

		<PackagesByCategory></PackagesByCategory>

		<div class="delimiter"></div>

		<div class="section">
			<TopPackages type="most-downloaded"></TopPackages>
			<TopPackages type="new"></TopPackages>
		</div>

		<div class="delimiter"></div>

		<div class="section block">
			<RecentlyUpdatedPackages></RecentlyUpdatedPackages>
		</div>

		<br><br>
		<div class="section">
			<a class="link" href="/search/" use:link>All Packages</a>
		</div>

		<div class="delimiter"></div>

		<div class="section">
			<img src="{motokoImg}" alt="">
			<div class="text">
				<div class="title">Built for Motoko</div>
				<div class="description">The Motoko programming language is a new, modern and type safe language for developers who want to build the next generation of distributed applications to run on the <a href="https://internetcomputer.org/">Internet Computer</a> blockchain network.</div>
			</div>
		</div>
	</div>
</div>

<Footer />

<style>
	.main {
		display: flex;
		flex-direction: column;
	}

	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: 40px;
		margin-bottom: 50px;
	}

	.content > * {
		max-width: 900px;
	}

	.delimiter {
		width: 50%;
		height: 12px;
		background: whitesmoke;
		margin: 30px 0;
		border-radius: 50%;
	}

	/* getting started */
	.getting-started {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 30px 50px;
		gap: 30px;
	}

	.getting-started .buttons {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
	}

	.getting-started .button {
		padding: 14px 18px;
		background: var(--color-primary);
		color: white;
		cursor: pointer;
		border-radius: 40px;
		box-shadow: -1px 2px 4px #555;
		font-size: 18px;
		font-weight: 500;
		user-select: none;
	}

	.getting-started .button:active {
		box-shadow: -1px 1px 2px #555;
	}

	.section {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 40px;
		width: 100%;
		padding: 0 40px;
		box-sizing: border-box;
	}

	.section.block {
		display: block;
	}

	.section img {
		width: 300px;
	}

	.section .text {
		width: min-content;
		min-width: 300px;
		flex-grow: 1;
	}

	.section .title {
		margin-bottom: 30px;
		font-weight: 500;
		font-size: 30px;
	}

	.section .description {
		font-size: 18px;
	}
</style>
<script lang="ts">
	import {Router, currentURL, routeParams} from "svelte-spa-history-router";
	import {onMount} from "svelte";

	import Home from "./Home.svelte";
	import SearchResults from "./SearchResults.svelte";
	import Package from "./package/Package.svelte";
	import InstallDoc from "./docs/InstallDoc.svelte";
	import PublishDoc from "./docs/PublishDoc.svelte";
	import ConfigDoc from "./docs/ConfigDoc.svelte";
	// import UserPage from './docs/UserPage.svelte';

	let routes = [
		{path: "/", component: Home},
		{path: "/docs/install", component: InstallDoc},
		{path: "/docs/publish", component: PublishDoc},
		{path: "/docs/config", component: ConfigDoc},
		// {path: '/@(?<username>.+)', component: UserPage},
		{path: "/search/(?<search>.*)", component: SearchResults},
		{path: "/(?<packageId>(?<packageName>.*?)(@(?<version>.*?))?)/(?<tab>code)/(?<file>.*)", component: Package},
		{path: "/(?<packageId>(?<packageName>.*?)(@(?<version>.*?))?)/(?<tab>docs)/(?<file>.*)", component: Package},
		{path: "/(?<packageId>(?<packageName>.*?)(@(?<version>.*?))?)(/(?<tab>.*?))?", component: Package},
	];

	// redirect legacy paths
	if (location.hash.match(/^#\/(docs|search|package)/)) {
		location.href = location.origin + location.hash.replace("#/package/", "/").replace("#/", "/");
	}

	// reset scroll on navigate
	let resetScrollTimer : any;
	onMount(() => {
		let popstate = () => {
			clearTimeout(resetScrollTimer);
		};
		window.addEventListener("popstate", popstate);
		return () => {
			window.removeEventListener("popstate", popstate);
		};
	});
	$: {
		if ($currentURL) {
			resetScrollTimer = setTimeout(() => {
				// hack to scroll to docs section
				if ($routeParams.packageId && $routeParams.tab == "docs") {
					setTimeout(() => {
						let docsEl = document.querySelector("#package-docs") as HTMLElement;
						let to = docsEl?.offsetTop || 0;
						if (document.body.scrollTop > to) {
							docsEl.scrollIntoView({behavior: "smooth"});
						}
					}, 200);
				}
				else {
					window.scrollTo(0, 0);
				}
			});
		}
	}
</script>

<div class="app">
	<Router {routes}/>
</div>

<style global>
	:root {
		--color-primary: hsl(73deg 20% 44%);
		--color-primary-light: hsl(72deg 24% 55%);
		--color-secondary: rgb(213 217 208);
	}

	body {
		margin: 0;
		font-family: sans-serif;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
	}

	button {
		font-weight: 600;
	}

	button:not(:disabled) {
		cursor: pointer;
	}

	.app {
		/* display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100vh; */
	}

	.app-loader {
		height: 100vh;
		width: 100vw;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.app-content {
		flex-grow: 1;
		overflow: auto;
	}

	[hidden] {
		display: none !important;
	}

	a {
		color: #7c8659;
		font-weight: 500;
		text-decoration: none;
	}

	input, button, select, textarea {
		font-family: inherit;
		font-size: inherit;
		padding: 0.4em;
		/* margin: 0 0 0.5em 0; */
		box-sizing: border-box;
		border: 1px solid #ccc;
		border-radius: 2px;
	}

	input:disabled {
		color: #ccc;
	}

	button {
		color: #333;
		background-color: #f4f4f4;
		outline: none;
	}

	button:disabled {
		color: #999;
	}

	button:not(:disabled):active {
		background-color: #ddd;
	}

	select:focus:not(:focus-visible) {
		outline: none;
	}

	button:focus-visible {
		border-color: #666;
	}
</style>
<script lang="ts">
	import {push} from "svelte-spa-history-router";

	export let searchText = "";
	let searchBarShown = false;

	function search() {
		let text = searchText.trim().toLowerCase();
		if (!text) {
			return;
		}

		push(`/search/${text}`);
	}

	function onKeyDown(e : KeyboardEvent) {
		if (e.key == "Enter") {
			search();
		}
	}

	function toggleSearchBar() {
		searchBarShown = !searchBarShown;
	}
</script>

<header class:search-bar-shown={searchBarShown}>
	<mops-navbar class="navbar"></mops-navbar>

	<div class="search-mobile" on:click="{toggleSearchBar}" >
		<div class="search-mobile-icon">
			<svg width="35px" height="35px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="stroke: var(--color-primary);">
				<path d="M15.7955 15.8111L21 21M18 10.5C18 14.6421 14.6421 18 10.5 18C6.35786 18 3 14.6421 3 10.5C3 6.35786 6.35786 3 10.5 3C14.6421 3 18 6.35786 18 10.5Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
			</svg>
		</div>
	</div>

	<div class="search">
		<input class="input" bind:value={searchText} on:keydown={onKeyDown} placeholder="Search motoko packages..." spellcheck="false" maxlength="100">
		<div class="button" on:click="{search}">Search</div>
	</div>
</header>

<style>
	header {
		/* position: sticky;
		top: 0;
		background: white; */

		position: relative;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: 10px 30px;
		box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.1);
	}

	.search-mobile {
		display: none;
	}

	.search {
		display: flex;
		justify-content: center;
		min-width: 0;
		margin-left: auto;
		margin-right: auto;
		transform: translateX(-50%);
	}

	.input {
		width: 450px;
		padding: 10px;
		border: 2px solid var(--color-primary-light);
		outline: none;
		border-right: none;
		border-radius: 3px 0 0 3px;
		height: 50px;
		font-size: 20px;
		line-height: 50px;
		min-width: 0;
	}

	.input:focus {
		border-color: var(--color-primary);
	}

	.button {
		display: flex;
		align-items: center;
		background: var(--color-primary);
		color: #ffffff;
		font-size: 18px;
		padding: 10px 20px;
		text-align: center;
		cursor: pointer;
		border-radius: 0 3px 3px 0;
		user-select: none;
	}

	@media (width < 1600px) {
		header {
			justify-content: flex-start;
		}

		.search {
			transform: none;
			margin-left: 0;
		}
	}

	@media (width < 700px) {
		header:not(.search-bar-shown) .search {
			display: none;
		}
		header.search-bar-shown .navbar {
			display: none;
		}

		.search-mobile {
			display: block;
		}
	}
</style>
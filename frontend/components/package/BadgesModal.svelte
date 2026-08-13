<script lang="ts">
	import Modal from "../Modal.svelte";

	export let packageName : string;
	export let active = false;

	function badgeUrl(badgeName : string) {
		if (process.env.NODE_ENV === "development") {
			// Local canister ids are allocated by the replica, not fixed like
			// dfx's specified_id. vite.config.ts injects the deployed one.
			return `http://localhost:4943/badge/${badgeName}/${packageName}?canisterId=${process.env.CANISTER_ID_MAIN}`;
		}
		else {
			return `https://oknww-riaaa-aaaam-qaf6a-cai.raw.ic0.app/badge/${badgeName}/${packageName}`;
		}
	}
</script>

<Modal bind:active="{active}" size="medium" popup={true}>
	<div class="container">
		If you are the author of this package, you can use these badges by adding the following code to your README.md file:

		<div class="row">
			<code class="code">
				[![mops]({badgeUrl("mops")})](https://mops.one/{packageName})
			</code>
			<div class="preview">
				<img src="{badgeUrl("mops")}">
			</div>
		</div>

		<div class="row">
			<code class="code">
				[![documentation]({badgeUrl("documentation")})](https://mops.one/{packageName}/docs)
			</code>
			<div class="preview">
				<img src="{badgeUrl("documentation")}">
			</div>
		</div>
	</div>
</Modal>

<style>
	.container {
		display: flex;
		flex-direction: column;
		gap: 25px;
	}

	.row {
		display: flex;
		gap: 10px;
	}

	.row > * {
		flex-grow: 1;
	}

	.code {
		padding: 10px;
		flex-basis: 50%;
	}

	.preview {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
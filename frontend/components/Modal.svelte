<script lang="ts">
	export let title = "";
	export let theme = "";
	export let size : "small" | "medium" | "large" = "small";
	export let active = false;
	export let popup = false;
	export let valid = true;

	let resolve : (ok : boolean) => void = () => {};

	export function open() {
		active = true;
		return new Promise((res) => {
			resolve = res;
		});
	}

	export function close() {
		cancel();
	}

	function confirm() {
		if (!valid) {
			return;
		}
		active = false;
		resolve(true);
	}

	function cancel() {
		active = false;
		resolve(false);
	}

	function windowKeydown(e : KeyboardEvent) {
		if (!active) {
			return;
		}
		if (e.key === "Enter") {
			confirm();
		}
		if (e.key === "Escape") {
			cancel();
		}
	}
</script>

<svelte:window on:keydown="{windowKeydown}"/>

<div class="container" class:active="{active}" data-size="{size}" data-theme="{theme}">
	<div class="dialog">
		{#if title}
			<div class="title">{title}</div>
		{/if}

		<div class="content">
			<slot></slot>
		</div>

		<div class="footer">
			{#if popup}
				<button class="button cancel" on:click="{cancel}">Close</button>
			{:else}
				<button class="button confirm" on:click="{confirm}" disabled="{!valid}">OK</button>
				<button class="button cancel" on:click="{cancel}">Cancel</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.container:not(.active) {
		opacity: 0;
		pointer-events: none;
	}

	.container {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;

		display: flex;
		align-items: center;
		justify-content: center;

		background: rgb(0 0 0 / 20%);
		backdrop-filter: blur(2px);
		transition: opacity 0.3s;
		z-index: 99999;

		box-shadow: 10px 0 0 black;
	}

	.container[data-size=small] .dialog { width: 350px; }
	.container[data-size=medium] .dialog { width: 600px; }
	.container[data-size=large] .dialog { width: 900px; }

	.container[data-theme=success] .title { color: rgb(16, 155, 4); }
	.container[data-theme=warning] .title { color: rgb(170, 12, 12); }

	.dialog {
		display: flex;
		flex-direction: column;
		width: 350px;
		max-height: calc(100vh - 40px);
		box-sizing: border-box;
		padding: 20px;
		border-radius: 10px;
		background: white;
		box-shadow: 0 0 10px rgb(0 0 0 / 30%);
	}

	.content {
		display: flex;
		flex-direction: column;
		overflow: auto;
	}

	.title {
		font-size: 22px;
		font-weight: 400;
		margin-bottom: 20px;
	}

	.footer {
		display: flex;
		flex-direction: row-reverse;
		gap: 20px;
		margin-top: 20px;
	}

	.button {
		width: 100px;
	}

	.button.cancel {
		font-weight: 400;
	}

	.button.confirm {
		font-weight: 500;
	}
</style>
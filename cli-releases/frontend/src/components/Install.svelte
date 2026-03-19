<script lang="ts">
	let copyText = "📋";

	function copyToClipboard(e : MouseEvent | KeyboardEvent) {
		let command = "";
		if (!(e.target instanceof HTMLElement)) {
			return;
		}
		let target = e.target;

		command = target.parentElement?.querySelector(".command")?.textContent || "";

		if (!command) {
			return;
		}

		navigator.clipboard.writeText(command).then(() => {
			target.textContent = "✔️";
			setTimeout(() => {
				target.textContent = "📋";
			}, 2000);
		}, (err) => {
			console.error("Could not copy text: ", err);
		});
	}
</script>

<div class="install">
	<div class="title">Install latest Mops CLI</div>
	<div class="command-container">
		<code class="command">curl -fsSL cli.mops.one/install.sh | sh</code>
		<div class="copy" on:click="{copyToClipboard}" role="button" on:keydown="{(e => e.key === "Enter" && copyToClipboard(e))}" tabindex="0">{copyText}</div>
	</div>
</div>

<div class="install">
	<div class="title">or update Mops CLI to the latest version</div>
	<div class="command-container">
		<code class="command">mops self update</code>
		<div class="copy" on:click="{copyToClipboard}" role="button" on:keydown="{(e => e.key === "Enter" && copyToClipboard(e))}" tabindex="0">{copyText}</div>
	</div>
</div>

<style>
	.install {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 30px;
		gap: 14px;
	}

	.title {
		font-weight: 500;
		font-size: 18px;
	}

	.command-container {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.command {
		background-color: #f0f0f0;
		padding: 10px;
		border-radius: 4px;
		margin: 0 auto;
		box-shadow: 0 0 2px gray;
		font-size: 14px;
	}

	.command::before {
		content: "$ ";
		color: gray;
	}

	.copy {
		cursor: pointer;
		padding: 5px;
		font-size: 20px;
		user-select: none;
	}
</style>
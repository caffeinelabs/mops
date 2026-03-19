<script lang="ts">
	import {routeParams} from "svelte-spa-history-router";
	import {toHtml} from "hast-util-to-html";
	import {onMount} from "svelte";
	import {filesize} from "filesize";
	import {downloadFile} from "ic-mops/api/downloadPackageFiles";
	import "@wooorm/starry-night/style/light";

	import {getStarryNight} from "/logic/get-starry-night";
	import {PackageDetails} from "/declarations/main/main.did.js";
	import PackageCodeTreeView from "./PackageCodeTreeView.svelte";
	import {mainActor} from "/logic/actors";
	import Loader from "../Loader.svelte";

	export let packageDetails : PackageDetails;
	export let fileIds : string[];

	let pkgId = `${packageDetails.config.name}@${packageDetails.config.version}`;

	let files : string[] = fileIds.map((id) => id.replace(pkgId + "/", ""));
	let tree = buildTree(files);

	let cachedFilesContent = new Map<string, string>();
	let cachedFilesContentHtml = new Map<string, string>();
	let fileContent = "";
	let fileContentHtml : null | string = null;
	let lineHighlightActive = false;

	$: selectedFileName = $routeParams.file ? $routeParams.file : "";

	type Tree = {
		name : string;
		path : string;
		children : Tree;
	}[];

	function buildTree(filenames : string[]) : Tree {
		const root : Tree = [];

		filenames
			.toSorted((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b))
			.forEach(filename => {
				const parts = filename.split("/");
				let currentLevel = root;

				parts.forEach((part, index) => {
					const path = parts.slice(0, index + 1).join("/");
					let node = currentLevel.find(c => c.name === part);

					if (!node) {
						node = {name: part, path, children: []};
						currentLevel.push(node);
					}

					currentLevel = node.children;
				});
			});

		return root;
	}

	let fileHashes = new Map<string, string>();

	async function loadFileHashes() {
		let main = await mainActor();
		let res = await main.getFileHashesQuery(packageDetails.config.name, packageDetails.config.version);
		if ("ok" in res) {
			fileHashes = new Map(res.ok.map(([name, hash]) => [name, Array.from(hash).map((byte) => byte.toString(16).padStart(2, "0")).join("")]));
		}
	}

	function getFileHash(filename : string, _d : any) {
		return fileHashes.get(pkgId + "/" + filename) || "";
	}

	loadFileHashes();

	async function loadSelectedFile() {
		if (codeViewEl) {
			codeViewEl.scrollTop = 0;
		}

		// prevent saving to worng file when switching between files before the previous one is loaded
		let curSelectedFileName = selectedFileName;

		if (cachedFilesContentHtml.has(curSelectedFileName)) {
			fileContentHtml = cachedFilesContentHtml.get(curSelectedFileName);
			fileContent = cachedFilesContent.get(curSelectedFileName);
			return;
		}

		fileContentHtml = null;
		fileContent = "";

		let {data} = await downloadFile(packageDetails.publication.storage.toText(), pkgId + "/" + curSelectedFileName);
		let content = new TextDecoder().decode(new Uint8Array(data));

		// syntax highlight
		let starryNight = await getStarryNight();
		let html = "";
		if (curSelectedFileName.endsWith(".mo")) {
			html = toHtml(starryNight.highlight(content, "source.mo"));
		}
		else if (curSelectedFileName.endsWith(".md")) {
			html = toHtml(starryNight.highlight(content, "text.md"));
		}
		else if (curSelectedFileName.endsWith(".toml")) {
			html = toHtml(starryNight.highlight(content, "source.toml"));
		}
		else {
			html = content;
		}

		cachedFilesContent.set(curSelectedFileName, content);
		cachedFilesContentHtml.set(curSelectedFileName, html);

		// render only if the selected file is still the same
		if (curSelectedFileName === selectedFileName) {
			fileContent = content;
			fileContentHtml = html;
			requestAnimationFrame(onResize);
			requestAnimationFrame(scrollToDefiition);
		}
	}

	function scrollToDefiition() {
		let parts = location.hash.replace("#", "").split(".").filter(x => x);

		let prev2 : Node | null = null;
		let prev : Node | null = null;
		let prevClasses : string[] = [];

		for (let child of Array.from(codeViewEl.querySelector(".content").childNodes)) {
			let scroll = false;

			if (prev) {
				if (parts[0] === "type" && (prev.textContent === "type" || prev.textContent === "class") && child.textContent === parts[1]) {
					scroll = true;
				}

				if (parts.length === 1 || parts.length > 1 && parts.slice(0, -1).every((part) => prevClasses.includes(part))) {
					if ((prev.textContent === "func" || prev2?.textContent === "public" && prev.textContent === "let") && child.textContent.trim().match(`^${parts.at(-1)}(\\(| :|$)`)) {
						scroll = true;
					}
				}

				if (prev.textContent === "class" && child.textContent.trim()) {
					prevClasses.push(child.textContent.trim());
				}
			}

			if (prev?.textContent.trim()) {
				prev2 = prev;
			}
			if (child.textContent.trim()) {
				prev = child;
			}

			if (scroll) {
				let el : HTMLElement;
				if (child instanceof HTMLElement) {
					el = child;
				}
				else if (child.previousSibling instanceof HTMLElement) {
					el = child.previousSibling;
				}

				el.scrollIntoView({block: "start", behavior: "smooth"});

				lineHighlightEl.style.top = `${el.offsetTop}px`;

				lineHighlightActive = true;
				setTimeout(() => {
					lineHighlightActive = false;
					setTimeout(() => {
						lineHighlightEl.style.top = "0";
					}, 700);
				}, 1000);

				break;
			}
		}
	}

	$: {
		if (selectedFileName) {
			loadSelectedFile();
		}
	}

	// calculate el heights
	let filesEl : HTMLElement;
	let codeViewEl : HTMLElement;
	let lineHighlightEl : HTMLElement;

	let filesPanelHeight = "";
	let footerHeight = document.querySelector("#app-footer").getBoundingClientRect().height;
	let margin = 40;
	let padding = 10;
	let bottomSpace = 0;

	// adjust side panels' height on scroll
	let onResize = () => {
		let filesTop = Math.max(0, filesEl.getBoundingClientRect().top);
		let scrollTopWithFooter = document.body.scrollTop + document.body.clientHeight + footerHeight + margin - padding;
		let footerSizeFiles = Math.max(bottomSpace, scrollTopWithFooter - document.body.clientHeight);

		filesPanelHeight = `calc(100vh - ${Math.floor(filesTop + footerSizeFiles)}px)`;
		codeViewEl.style.maxHeight = `calc(${Math.floor(window.innerHeight - codeViewEl.offsetTop - footerHeight - margin)}px)`;
	};

	onMount(() => {
		filesEl && onResize();
		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
		};
	});
</script>

<div id="package-code" class="package-code">
	<div class="files" style:max-height={filesPanelHeight} bind:this={filesEl}>
		<div class="files-scrollable">
			{#each tree as node}
				<PackageCodeTreeView {node} root={true}></PackageCodeTreeView>
			{/each}
		</div>
	</div>

	<div class="middle-right">
		<div class="header" hidden={!selectedFileName}>
			<div class="file-name"><code>{selectedFileName}</code></div>
			<div class="file-size">{filesize(fileContent.length, {standard: "iec", round: 1})}</div>
			<div class="bullet">•</div>
			<div class="file-hash">{getFileHash(selectedFileName, fileHashes)}</div>
		</div>

		<div class="code-view" hidden={!selectedFileName || fileContentHtml == null} bind:this={codeViewEl}>
			<div class="code-view-wrap">
				<div class="line-numbers">
					{#each fileContent.split("\n") as _line, i}
						<div class="line-number">{i + 1}</div>
					{/each}
				</div>
				<div class="content">
					{@html fileContentHtml}
					<div class="line-highlight" class:active={lineHighlightActive} bind:this={lineHighlightEl}></div>
				</div>
			</div>
		</div>

		{#if selectedFileName && fileContentHtml == null}
			<div class="loader">
				<Loader></Loader>
			</div>
		{/if}

		<div class="no-file-selected" hidden={selectedFileName}>
			<div class="file-name">Select a file to view its content</div>
		</div>
	</div>
</div>

<style>
	.package-code {
		display: flex;
		flex-direction: row;
		flex-grow: 1;
		min-width: 0;
	}

	.middle-right {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex-grow: 1;
		padding: 10px;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid rgb(111 111 111);
	}

	.header .file-name {
		font-size: 20px;
		font-weight: bold;
	}

	.header .file-size {
		margin-left: auto;
	}

	.header :is(.file-size, .file-hash, .bullet) {
		white-space: nowrap;
		font-size: 13px;
		color: gray;
	}

	.header .file-hash {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.files {
		display: flex;
		position: sticky;
		top: 0;
		max-height: calc(100vh - 330px);
		width: 265px;
		flex-shrink: 0;
	}

	.files-scrollable {
		overflow: auto;
		margin: 15px 0;
		flex-grow: 1;
	}

	.files-scrollable::-webkit-scrollbar {
		width: 10px;
	}

	.files-scrollable::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.03);
	}

	.files-scrollable::-webkit-scrollbar-thumb {
		background-color: lightgrey;
		border-radius: 5px;
	}

	/* files */
	.files {
		background: white;
		z-index: 2;
	}

	.files-scrollable {
		padding-right: 2px;
	}

	.no-file-selected, .loader {
		margin: 70px auto;
	}

	/* code */
	.code-view {
		font-family: monospace;
		line-height: 1.55;
		tab-size: 4;
		overflow: auto;
	}

	.code-view-wrap {
		display: flex;
	}

	.line-numbers {
		position: sticky;
		left: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding: 8px 10px;
		background: rgb(246 248 248);
		color: #8e8e8e;
		border-right: 1px solid rgb(185 185 185);
		user-select: none;
	}

	.content {
		position: relative;
		flex-grow: 1;
		padding: 8px 15px;
		white-space: pre;
		background: rgb(248 250 250);
	}

	.line-highlight {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		z-index: 1;

		height: 1.3em;
		opacity: 0;
		background: rgba(255, 255, 0, 0.4);
		mix-blend-mode: multiply;
		transition: opacity cubic-bezier(0, 0.79, 0.76, 0.3) 700ms;
		pointer-events: none;
	}

	.line-highlight.active {
		opacity: 1;
	}

	@media (max-width: 1030px) {
		.package-code {
			flex-wrap: wrap;
		}

		.code-view {
			min-height: 250px;
		}

		.files {
			position: static;
			flex-grow: 1;
			height: 185px;
		}
	}
</style>
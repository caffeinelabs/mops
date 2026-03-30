<script>
	import Header from '../Header.svelte';
	import Footer from '../Footer.svelte';
</script>

<svelte:head>
	<title>Mops • Install</title>
</svelte:head>

<Header></Header>

<div class="documentation">
	<div class="content">
		<h1>How to install packages</h1>

		<h2>Requirements</h2>
		<ul>
			<li><a href="https://nodejs.org/" target="_blank">Node.js</a></li>
			<li><a href="https://internetcomputer.org/docs/current/developer-docs/quickstart/local-quickstart" target="_blank">DFX</a> >= 0.10.0</li>
		</ul>

		<h3>1. Install CLI tool</h3>
		<code>npm i -g ic-mops</code>
		<br>
		<div>This command will install cli tool <code class="inline">mops</code></div>

		<h3>2. Configure dfx.json</h3>
		<div>Add <code class="inline">mops</code> as a packtool to your <code class="inline">dfx.json</code></div>
		<br>
		<code>
			<div>...</div>
			<div>"defaults": &lbrace;</div>
			<div>&nbsp;&nbsp;"build": &lbrace;</div>
			<div>&nbsp;&nbsp;&nbsp;&nbsp;"packtool": "mops sources"</div>
			<div>&nbsp;&nbsp;&rbrace;</div>
			<div>&rbrace;,</div>
			<div>...</div>
		</code>

		<h3>3. Initialize</h3>
		<div>Run this command in the root directory of your project (where is <code class="inline">dfx.json</code> placed)</div>
		<div>If there are Vessel config files, mops will migrate packages from <code class="inline">vessel.dhall</code> to <code class="inline">mops.toml</code></div>
		<br>
		<code>mops init</code>

		<h3>4. Install Motoko Packages</h3>
		<div>Use <code class="inline">mops add &lt;package_name&gt;</code> to install a specific package and save it to <code class="inline">mops.toml</code></div>
		<br>
		<code>mops add base</code>
		<br>
		<div>You can also add packages from GitHub like this</div>
		<br>
		<code>mops add https://github.com/caffeinelabs/motoko-base</code>

		<br>
		<div>For GitHub-packages you can specify branch, tag, or commit hash by adding <code class="inline">#&lt;branch/tag/hash&gt;</code></div>
		<br>
		<code>mops add https://github.com/caffeinelabs/motoko-base#moc-0.9.1</code>

		<br>
		<div>You can also add local packages like this (put source files inside <code class="inline">src</code> directory)</div>
		<br>
		<code>mops add ./shared</code>

		<br>
		<br>
		<div>Use <code class="inline">mops install</code> to install all packages specified in <code class="inline">mops.toml</code></div>
		<br>
		<code>mops install</code>

		<h3>5. Import Package</h3>
		<div>Now you can import installed packages in your Motoko code</div>
		<br>
		<code>import PackageName "mo:&lt;package_name&gt;";</code>
		<br>
		<div>for example</div>
		<br>
		<code>import Itertools "mo:itertools/Iter";</code>
	</div>
</div>

<Footer />

<style>
	@import "./docs.css";
</style>
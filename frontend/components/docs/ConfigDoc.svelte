<script>
	import Header from '../Header.svelte';
	import Footer from '../Footer.svelte';
</script>

<svelte:head>
	<title>Mops • mops.toml</title>
</svelte:head>

<Header></Header>

<div class="documentation">
	<div class="content">
		<h1>mops.toml config file</h1>

		<h3>[package]</h3>

		<table>
			<tr>
				<th>Field</th>
				<th>Type</th>
				<th>Description</th>
			</tr>
			<tr>
				<td>name</td>
				<td>Text</td>
				<td>Package name (e.g. lib)</td>
			</tr>
			<tr>
				<td>version</td>
				<td>Text</td>
				<td>Package version in format x.x.x (e.g. 0.1.2)</td>
			</tr>
			<tr>
				<td>description</td>
				<td>Text</td>
				<td>Package description shown in search results</td>
			</tr>
			<tr>
				<td>repository</td>
				<td>Text</td>
				<td>Repository url (e.g. https://github.com/caffeinelabs/motoko)</td>
			</tr>
			<tr>
				<td>keywords</td>
				<td>[Text]</td>
				<td>Array of keywords (max 10 items, max 20 chars)</td>
			</tr>
			<!-- <tr>
				<td>documentation</td>
				<td>Text</td>
				<td>Documentation url</td>
			</tr> -->
			<!-- <tr>
				<td>homepage</td>
				<td>Text</td>
				<td>Homepage url (currently disabled)</td>
			</tr> -->
			<tr>
				<td>license</td>
				<td>Text</td>
				<td>Package license. Use <a href="https://spdx.org/licenses/" target="_blank">SPDX license identifier</a></td>
			</tr>
			<!-- <tr>
				<td>donation</td>
				<td>Text</td>
				<td>Donation address (currently disabled)</td>
			</tr>
			<tr>
				<td>dfx</td>
				<td>Text</td>
				<td>Supported dfx version (currently disabled)</td>
			</tr>
			<tr>
				<td>moc</td>
				<td>Text</td>
				<td>Supported moc version  (currently disabled)</td>
			</tr> -->
		</table>

		<h3>[dependencies]</h3>
		<table>
			<tr>
				<td>&lt;package_name&gt;</td>
				<td>=</td>
				<td>&lt;package_version&gt; (in format x.x.x)</td>
			</tr>
		</table>

		<!-- <h3>[scripts]</h3>
		(currently disabled)
		<table>
			<tr>
				<td>&lt;script_name&gt;</td>
				<td>=</td>
				<td>&lt;script_value&gt;</td>
			</tr>
		</table> -->
	</div>
</div>

<Footer />

<style>
	@import "./docs.css";

	table {
		border-spacing: 0;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		padding: 10px;
	}

	td {
		border: 1px solid lightgray;
		padding: 10px 15px;
	}
</style>
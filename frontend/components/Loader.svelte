<script lang="ts">
	import {onMount} from "svelte";
	import mops2Img from "/img/mops2.svg";

	export let size = "200px";

	let loaderEl : HTMLElement;

	onMount(() => {
		loaderEl.style.setProperty("--size", size);
	});
</script>

<div bind:this="{loaderEl}" class="loader">
	<img src="{mops2Img}" alt="">
	<div class="grad"></div>
</div>

<style>
	.loader {
		display: flex;
		position: relative;
	}

	img {
		width: var(--size);
		height: var(--size);
		will-change: transform;
		opacity: 0.2;
		user-select: none;
		-webkit-user-drag: none;
	}

	.grad	{
		inset: 0;
		position: absolute;
		background-image: linear-gradient(90deg, rgb(255, 255, 255, 0.9) 0px, transparent 60px, rgb(255, 255, 255, 0.9) 120px);
		animation: slide 50s linear;
	}

	@keyframes slide {
		0% {
			background-position-x: 130px;
		}
		100% {
			background-position-x: 8000px;
		}
	}
</style>
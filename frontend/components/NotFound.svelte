<script lang="ts">
	import sadMopsImg from "/img/sad-mops.svg";
</script>

<div class="not-found">
	<div class="not-found-text"><slot></slot></div>
	<img class="not-found-img" src="{sadMopsImg}" alt="">
</div>

<style>
	.not-found {
		display: flex;
		align-items: center;
		flex-direction: column;
	}

	.not-found-text {
		font-size: 24px;
		color: #9d9d9d;
		margin: 20px 0;
	}

	.not-found-img {
		width: 250px;
	}
</style>
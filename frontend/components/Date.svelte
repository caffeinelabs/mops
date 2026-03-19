<script lang="ts">
	import {formatDistanceStrict} from "date-fns";

	export let date : number | Date;

	function distance(date :  number | Date) {
		return formatDistanceStrict(date, Date.now(), {addSuffix: true});
	}

	function format(date : number | Date) {
		return Intl.DateTimeFormat(navigator.language, {year: "numeric", month: "long", day: "numeric"}).format(date);
	}
</script>

<span title="{format(date)}">{distance(date)}</span>
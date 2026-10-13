<script lang="ts">
	import { ImageOff } from '@lucide/svelte';
	import { rejectionText } from '$lib/image-moderation';

	let { reason, class: className = '' }: { reason: string | undefined; class?: string } = $props();

	const text = $derived(rejectionText(reason));
	const label = $derived(`Photo ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
</script>

<div class="kc-thumb moderation-rejected {className}" role="img" aria-label={label} title={text}>
	<ImageOff class="h-5 w-5 shrink-0" />
	<span>{text}</span>
</div>

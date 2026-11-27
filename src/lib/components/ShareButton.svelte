<script lang="ts">
	import { Check, Link2Off, Share2 } from '@lucide/svelte';
	import { Visibility } from '@roguekeyboards/mykeebs-api-client';
	import { page } from '$app/state';
	import { itemLink, shareLink } from '#lib/share.js';

	let { id, title, visibility }: { id: string; title: string; visibility?: Visibility } = $props();

	let outcome = $state<'copied' | 'failed' | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const message = $derived(
		outcome === 'copied' ? 'Link copied' : outcome === 'failed' ? "Couldn't copy the link" : ''
	);

	async function share() {
		const result = await shareLink(itemLink(page.url, id), title);
		if (result !== 'copied' && result !== 'failed') return;
		outcome = result;
		clearTimeout(timer);
		timer = setTimeout(() => (outcome = null), 2000);
	}

	$effect(() => () => clearTimeout(timer));
</script>

<!-- Nobody but the owner could open a link to a private item. -->
{#if visibility !== Visibility.Private}
	<span class="sr-only" role="status">{message}</span>
	<button
		type="button"
		class="btn-icon"
		aria-label="Share link to {title}"
		title={message || 'Share link'}
		onclick={share}
	>
		{#if outcome === 'copied'}
			<Check class="h-5 w-5" />
		{:else if outcome === 'failed'}
			<Link2Off class="h-5 w-5" style="color: var(--danger)" />
		{:else}
			<Share2 class="h-5 w-5" />
		{/if}
	</button>
{/if}

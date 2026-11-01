<script lang="ts">
	import type { Component } from 'svelte';
	import { ArrowLeft, ArrowRight } from '@lucide/svelte';
	import { Visibility } from '@roguekeyboards/mykeebs-api-client';
	import Modal from '../Modal.svelte';
	import VisibilityBadge from '../VisibilityBadge.svelte';

	let {
		details: Details,
		detailsProps,
		kitArrows = false
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		details: Component<any>;
		detailsProps: Record<string, unknown>;
		kitArrows?: boolean;
	} = $props();
</script>

<Modal open onClose={() => {}} label="Details">
	{#snippet headerExtra()}
		{#if kitArrows}
			<button type="button" class="btn-icon" aria-label="Previous kit"><ArrowLeft /></button>
			<button type="button" class="btn-icon" aria-label="Next kit"><ArrowRight /></button>
		{:else}
			<VisibilityBadge visibility={Visibility.Public} />
		{/if}
	{/snippet}
	<Details {...detailsProps} />
</Modal>

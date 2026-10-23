<script lang="ts">
	import type { Visibility } from '@rogueserenity/kbdb-api-client';
	import { mixedVisibilityMeta, visibilityMeta } from '#lib/visibility.js';
	import VisibilityIcon from './VisibilityIcon.svelte';

	let {
		visibility,
		mixed = false,
		showLabel = false
	}: {
		visibility: Visibility | undefined;
		mixed?: boolean;
		showLabel?: boolean;
	} = $props();

	const meta = $derived(mixed ? mixedVisibilityMeta : visibilityMeta(visibility));
</script>

{#if meta}
	<span class="visibility-badge {meta.class}" title={meta.title}>
		<VisibilityIcon {visibility} {mixed} />
		{#if showLabel}<span>{meta.label}</span>{:else}<span class="sr-only">{meta.label}</span>{/if}
	</span>
{/if}

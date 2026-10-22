<script lang="ts">
	import { orderStatusClass } from '#lib/format.js';
	import { orderStatusIcon } from '#lib/order-status.js';

	let { status, showLabel = false }: { status: string; showLabel?: boolean } = $props();

	const Icon = $derived(orderStatusIcon(status));
</script>

<span
	class="status-badge {orderStatusClass(status)}"
	class:status-badge-with-icon={Icon}
	class:status-badge-icon-only={!showLabel}
	title={status}
>
	{#if Icon}
		<Icon class="h-3.5 w-3.5 shrink-0" />
	{/if}
	{#if showLabel}<span>{status}</span>{:else}<span class="sr-only">{status}</span>{/if}
</span>

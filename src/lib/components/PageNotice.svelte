<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let {
		onDismiss,
		children,
		class: className = 'mx-4 mt-4'
	}: { onDismiss: () => void; children: Snippet; class?: string } = $props();
</script>

<div
	class="kc-card flex items-start gap-3 p-3 text-sm {className}"
	role="alert"
	style="border-color: var(--warning)"
>
	<p class="flex-1">{@render children()}</p>
	<button type="button" class="btn-icon h-6 w-6 shrink-0" aria-label="Dismiss" onclick={onDismiss}>
		<X class="h-3.5 w-3.5" />
	</button>
</div>

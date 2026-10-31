<script lang="ts">
	import { Visibility } from '@roguekeyboards/mykeebs-api-client';
	import { Globe, Layers, Lock, User } from '@lucide/svelte';

	let {
		visibility,
		mixed = false,
		class: className = 'h-3.5 w-3.5 shrink-0'
	}: {
		visibility: Visibility | undefined;
		mixed?: boolean;
		class?: string;
	} = $props();

	const Icon = $derived.by(() => {
		if (mixed) return Layers;
		switch (visibility) {
			case Visibility.Public:
				return Globe;
			case Visibility.Authenticated:
				return User;
			default:
				return Lock;
		}
	});
</script>

<Icon class={className} aria-hidden="true" />

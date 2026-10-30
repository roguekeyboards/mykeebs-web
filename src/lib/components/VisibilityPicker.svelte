<script lang="ts">
	import type { Visibility } from '@roguekeyboards/kbdb-api-client';
	import { visibilityMeta, visibilityOptions } from '#lib/visibility.js';
	import VisibilityIcon from './VisibilityIcon.svelte';

	let { value = $bindable() }: { value: Visibility } = $props();

	// Focus follows selection within a radiogroup, and the newly selected
	// button is the only one left in the tab order.
	function select(event: Event, index: number) {
		value = visibilityOptions[index];
		const group = (event.currentTarget as HTMLElement).parentElement;
		(group?.children[index] as HTMLElement | undefined)?.focus();
	}

	function handleKeydown(event: KeyboardEvent, index: number) {
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
		if (step) {
			event.preventDefault();
			select(event, (index + step + visibilityOptions.length) % visibilityOptions.length);
		} else if (event.key === 'Home') {
			event.preventDefault();
			select(event, 0);
		} else if (event.key === 'End') {
			event.preventDefault();
			select(event, visibilityOptions.length - 1);
		}
	}
</script>

<div class="segmented-control" role="radiogroup" aria-label="Visibility">
	{#each visibilityOptions as option, index (option)}
		{@const meta = visibilityMeta(option)}
		{@const selected = value === option}
		<button
			type="button"
			class="segmented-control-btn visibility-picker-btn {selected
				? `visibility-picker-btn-active ${meta?.class}`
				: ''}"
			role="radio"
			aria-checked={selected}
			tabindex={selected ? 0 : -1}
			title={meta?.title}
			onclick={() => (value = option)}
			onkeydown={(event) => handleKeydown(event, index)}
		>
			<VisibilityIcon visibility={option} class="h-4 w-4 shrink-0" />
			<span>{meta?.label}</span>
		</button>
	{/each}
</div>

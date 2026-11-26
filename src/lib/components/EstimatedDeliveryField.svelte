<script lang="ts">
	import { untrack } from 'svelte';
	import { todayDateInput } from '#lib/format.js';
	import { quarterLabel, quarterOptions } from '#lib/estimated-delivery.js';

	let {
		value = $bindable(),
		name = 'estimatedDeliveryDate'
	}: {
		value: string;
		name?: string;
	} = $props();

	const SPECIFIC = 'specific';

	const quarters = quarterOptions(
		todayDateInput(),
		untrack(() => value)
	);
	let specific = $state(untrack(() => value !== '' && !quarterLabel(value)));

	function choose(event: Event) {
		const choice = (event.currentTarget as HTMLSelectElement).value;
		specific = choice === SPECIFIC;
		if (!specific) value = choice;
	}
</script>

<label class="flex flex-col gap-1.5">
	<span class="field-label">Estimated delivery</span>
	<select
		name="{name}Quarter"
		class="field-select w-full"
		value={specific ? SPECIFIC : value}
		onchange={choose}
	>
		<option value="">—</option>
		{#each quarters as quarter (quarter.value)}
			<option value={quarter.value}>{quarter.label}</option>
		{/each}
		<option value={SPECIFIC}>Specific date…</option>
	</select>
</label>
{#if specific}
	<label class="flex flex-col gap-1.5">
		<span class="field-label">Estimated delivery date</span>
		<input {name} type="date" class="field-input" bind:value />
	</label>
{/if}

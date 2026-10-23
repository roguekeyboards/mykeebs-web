<script lang="ts">
	import { untrack } from 'svelte';
	import { todayDateInput } from '#lib/format.js';
	import type { PurchaseDraft } from '#lib/keyboard-parts.js';

	let {
		purchase = $bindable(),
		vendors,
		orderStatuses,
		priceLabel = 'Price',
		priceHint,
		namePrefix = ''
	}: {
		purchase: PurchaseDraft;
		vendors: string[];
		orderStatuses: string[];
		priceLabel?: string;
		priceHint?: string;
		namePrefix?: string;
	} = $props();

	const uid = $props.id();

	let showOrderDate = $derived(
		purchase.orderStatus.trim() !== '' && purchase.orderStatus.trim().toLowerCase() !== 'planned'
	);
	let isDelivered = $derived(purchase.orderStatus.trim().toLowerCase() === 'delivered');

	// Only clears in response to a status change, never on mount: an existing
	// item may legitimately carry dates its current status wouldn't set.
	let lastOrderStatus = untrack(() => purchase.orderStatus);
	$effect(() => {
		if (purchase.orderStatus === lastOrderStatus) return;
		lastOrderStatus = purchase.orderStatus;
		if (!showOrderDate) purchase.orderDate = '';
		else if (!purchase.orderDate) purchase.orderDate = todayDateInput();
		if (!isDelivered) purchase.deliveryDate = '';
		else if (!purchase.deliveryDate) purchase.deliveryDate = todayDateInput();
	});

	function optionsWith(loaded: string[], current: string): string[] {
		return current && !loaded.includes(current) ? [current, ...loaded] : loaded;
	}
</script>

<label class="flex flex-col gap-1.5">
	<span class="field-label">Vendor</span>
	<select name="{namePrefix}vendor" class="field-select w-full" bind:value={purchase.vendor}>
		<option value="">—</option>
		{#each optionsWith(vendors, purchase.vendor) as value (value)}
			<option {value}>{value}</option>
		{/each}
	</select>
</label>
<label class="flex flex-col gap-1.5">
	<span class="field-label">Order status</span>
	<select
		name="{namePrefix}orderStatus"
		class="field-select w-full"
		bind:value={purchase.orderStatus}
	>
		<option value="">—</option>
		{#each optionsWith(orderStatuses, purchase.orderStatus) as value (value)}
			<option {value}>{value}</option>
		{/each}
	</select>
</label>
<label class="flex flex-col gap-1.5">
	<span class="field-label">{priceLabel}</span>
	<input
		name="{namePrefix}price"
		type="number"
		class="field-input"
		min="0"
		step="0.01"
		aria-describedby={priceHint ? `price-hint-${uid}` : undefined}
		bind:value={purchase.price}
	/>
	{#if priceHint}
		<span id="price-hint-{uid}" class="text-faint text-xs">{priceHint}</span>
	{/if}
</label>
{#if showOrderDate}
	<label class="flex flex-col gap-1.5">
		<span class="field-label">Order date</span>
		<input
			name="{namePrefix}orderDate"
			type="date"
			class="field-input"
			bind:value={purchase.orderDate}
		/>
	</label>
{/if}
{#if isDelivered}
	<label class="flex flex-col gap-1.5">
		<span class="field-label">Delivery date</span>
		<input
			name="{namePrefix}deliveryDate"
			type="date"
			class="field-input"
			bind:value={purchase.deliveryDate}
		/>
	</label>
{/if}

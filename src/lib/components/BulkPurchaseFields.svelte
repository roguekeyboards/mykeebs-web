<script lang="ts">
	import { X } from '@lucide/svelte';
	import { bulkPurchaseDraft, type BulkPurchaseDraft } from '#lib/purchases.js';
	import PurchaseFields from './PurchaseFields.svelte';

	let {
		purchases = $bindable(),
		vendors,
		orderStatuses,
		priceHint
	}: {
		purchases: BulkPurchaseDraft[];
		vendors: string[];
		orderStatuses: string[];
		priceHint?: string;
	} = $props();

	let several = $derived(purchases.length > 1);
</script>

<div class="flex flex-col gap-4">
	{#each purchases as purchase, index (purchase.key)}
		<fieldset
			class={several ? 'relative rounded-lg border p-4' : 'contents'}
			style={several ? 'border-color: var(--border)' : undefined}
		>
			{#if several}
				<legend class="field-label px-1">Purchase {index + 1}</legend>
				<button
					type="button"
					class="btn-icon absolute top-2 right-2 h-7 w-7"
					aria-label="Remove purchase {index + 1}"
					onclick={() => purchases.splice(index, 1)}
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<PurchaseFields
					bind:purchase={purchases[index]}
					{vendors}
					{orderStatuses}
					{priceHint}
					namePrefix="purchases[{index}]."
				/>
				<label class="flex flex-col gap-1.5">
					<span class="field-label">Quantity</span>
					<input
						name="purchases[{index}].quantity"
						type="number"
						class="field-input"
						min="1"
						step="1"
						bind:value={purchase.quantity}
					/>
				</label>
			</div>
		</fieldset>
	{/each}
	<button type="button" class="btn self-start" onclick={() => purchases.push(bulkPurchaseDraft())}>
		+ Add purchase
	</button>
</div>

<script lang="ts">
	import { formatPrice, type PurchaseLike } from '#lib/format.js';
	import PurchaseDetails from './PurchaseDetails.svelte';

	let {
		purchases,
		totalQuantity,
		totalCost,
		currency,
		showPrice
	}: {
		purchases: PurchaseLike[] | undefined;
		totalQuantity?: number;
		totalCost?: number;
		currency?: string;
		showPrice: boolean;
	} = $props();

	let total = $derived(showPrice ? formatPrice(totalCost, currency) : undefined);
</script>

{#if purchases?.length === 1}
	<div>
		<h3 class="section-label">Purchase</h3>
		<PurchaseDetails purchase={purchases[0]} {showPrice} />
	</div>
{:else if purchases?.length}
	<div>
		<h3 class="section-label">Purchases</h3>
		{#if totalQuantity != null || total}
			<dl class="spec-list mt-2">
				{#if totalQuantity != null}
					<div class="spec-row">
						<dt>Total quantity</dt>
						<dd>{totalQuantity}</dd>
					</div>
				{/if}
				{#if total}
					<div class="spec-row">
						<dt>Total price</dt>
						<dd>{total}</dd>
					</div>
				{/if}
			</dl>
		{/if}
		<ol class="mt-4 flex flex-col gap-4">
			{#each purchases as purchase, index (index)}
				<li class="rounded-lg border p-4" style="border-color: var(--border)">
					<h4 class="field-label">Purchase {index + 1}</h4>
					<PurchaseDetails {purchase} {showPrice} />
				</li>
			{/each}
		</ol>
	</div>
{/if}

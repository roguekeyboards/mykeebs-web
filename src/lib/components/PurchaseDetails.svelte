<script lang="ts">
	import { formatDate, formatPrice, type PurchaseLike } from '$lib/format';
	import OrderStatusBadge from './OrderStatusBadge.svelte';

	let {
		purchase,
		showPrice,
		priceLabel = 'Price'
	}: { purchase: PurchaseLike | undefined; showPrice: boolean; priceLabel?: string } = $props();
</script>

{#if purchase}
	{#if purchase.orderStatus}
		<span class="mt-2 inline-block">
			<OrderStatusBadge status={purchase.orderStatus} showLabel />
		</span>
	{/if}
	<dl class="spec-list mt-4">
		{#if purchase.vendor}
			<div class="spec-row">
				<dt>Vendor</dt>
				<dd>{purchase.vendor}</dd>
			</div>
		{/if}
		{#if purchase.quantity != null}
			<div class="spec-row">
				<dt>Quantity</dt>
				<dd>{purchase.quantity}</dd>
			</div>
		{/if}
		{#if showPrice && formatPrice(purchase.price, purchase.currency)}
			<div class="spec-row">
				<dt>{priceLabel}</dt>
				<dd>{formatPrice(purchase.price, purchase.currency)}</dd>
			</div>
		{/if}
		{#if formatDate(purchase.orderDate)}
			<div class="spec-row">
				<dt>Ordered</dt>
				<dd>{formatDate(purchase.orderDate)}</dd>
			</div>
		{/if}
		{#if formatDate(purchase.deliveryDate)}
			<div class="spec-row">
				<dt>Delivered</dt>
				<dd>{formatDate(purchase.deliveryDate)}</dd>
			</div>
		{/if}
	</dl>
{/if}

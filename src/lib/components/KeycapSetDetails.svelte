<script lang="ts">
	import type { KeycapKit, KeycapSet } from '@roguekeyboards/mykeebs-api-client';
	import OrderStatusBadge from './OrderStatusBadge.svelte';
	import { formatPrice } from '#lib/format.js';
	import { isPending } from '#lib/image-moderation.js';
	import PendingReviewBadge from './PendingReviewBadge.svelte';
	import RejectedImage from './RejectedImage.svelte';

	let {
		set,
		failedImages,
		onImageError,
		onKitClick,
		onAddKit,
		showPrice
	}: {
		set: KeycapSet;
		failedImages: ReadonlySet<string>;
		onImageError: (url: string) => void;
		onKitClick: (kit: KeycapKit) => void;
		onAddKit?: () => void;
		showPrice: boolean;
	} = $props();

	const totalCost = $derived(showPrice ? formatPrice(set.totalCost, set.currency) : undefined);
</script>

<div class="pr-8">
	<h2 class="heading-lg text-2xl">{set.name}</h2>
	<p class="text-muted">{set.brand}</p>
	{#if set.profile || set.material}
		<p class="text-faint mt-1 font-mono text-sm">
			{[set.profile, set.material].filter(Boolean).join(' · ')}
		</p>
	{/if}
	{#if set.notes}
		<p class="text-muted mt-2 text-sm">{set.notes}</p>
	{/if}
</div>

{#if totalCost}
	<dl class="spec-list mt-6 sm:w-1/2">
		<div class="spec-row">
			<dt>Total cost</dt>
			<dd>{totalCost}</dd>
		</div>
	</dl>
{/if}

<div class="mt-6 flex items-center justify-between">
	<h3 class="section-label">Kits</h3>
	{#if onAddKit}
		<button type="button" class="btn" onclick={onAddKit}>+ Add kit</button>
	{/if}
</div>

{#if set.kits && set.kits.length > 0}
	<div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
		{#each set.kits as kit (kit.kitId)}
			{@const imageFailed = kit.image?.url != null && failedImages.has(kit.image.url)}
			<button
				type="button"
				class="kc-card w-full overflow-hidden p-3 text-left"
				onclick={() => onKitClick(kit)}
			>
				{#if kit.image?.url && !imageFailed}
					<div class="relative">
						<img
							src={kit.image.url}
							alt=""
							class="kc-thumb-tile aspect-square w-full object-contain"
							loading="lazy"
							decoding="async"
							onerror={() => kit.image?.url && onImageError(kit.image.url)}
						/>
						{#if isPending(kit.image)}
							<PendingReviewBadge />
						{/if}
					</div>
				{:else if kit.image && !kit.image.url}
					<RejectedImage reason={kit.image.rejectionReason} class="aspect-square w-full text-sm" />
				{:else}
					<div
						class="kc-thumb-tile text-faint flex aspect-square w-full items-center justify-center text-sm"
					>
						No image
					</div>
				{/if}
				<div class="mt-2 flex items-center justify-between gap-2 pr-1">
					<h3 class="flex items-center gap-1.5 font-semibold">
						{kit.name}
						{#if kit.kitId === set.primaryKitId}
							<span class="text-faint text-xs" title="Primary kit">★</span>
						{/if}
					</h3>
					{#if kit.purchase?.orderStatus}
						<span class="shrink-0">
							<OrderStatusBadge status={kit.purchase.orderStatus} showLabel />
						</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>
{:else}
	<p class="text-muted mt-3 text-sm">No kits recorded for this set.</p>
{/if}

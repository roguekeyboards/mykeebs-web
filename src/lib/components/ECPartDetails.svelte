<script lang="ts">
	import type { ECPart } from '@roguekeyboards/mykeebs-api-client';
	import PurchaseDetails from '#lib/components/PurchaseDetails.svelte';
	import { isPending } from '#lib/image-moderation.js';
	import { ecPartMaterial, ecPartTypeLabel } from '#lib/ec-parts.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';

	let {
		part,
		onImageClick,
		onImageError,
		showPrice
	}: {
		part: ECPart;
		onImageClick: () => void;
		onImageError?: () => void;
		showPrice: boolean;
	} = $props();

	let failedUrl = $state<string | null>(null);

	const specs = $derived(
		(
			[
				['Weight', part.domes?.weight != null ? `${part.domes.weight}g` : undefined],
				['Size', part.sliders?.size ?? part.housings?.size],
				['Stem', part.sliders?.stem],
				['Material', ecPartMaterial(part)],
				['Color', part.domes?.color],
				['Thickness', part.rings?.thickness != null ? `${part.rings.thickness}mm` : undefined]
			] as [string, string | undefined][]
		).filter((row): row is [string, string] => Boolean(row[1]))
	);
</script>

<div class="flex flex-col items-start gap-4 sm:flex-row">
	{#if part.image?.url && part.image.url !== failedUrl}
		<button
			type="button"
			class="relative shrink-0 cursor-zoom-in"
			aria-label={isPending(part.image)
				? 'View full size image, pending review'
				: 'View full size image'}
			onclick={onImageClick}
		>
			<img
				src={part.image.url}
				alt={part.name}
				class="kc-thumb h-24 w-24 object-contain"
				decoding="async"
				onerror={() => {
					failedUrl = part.image?.url ?? null;
					onImageError?.();
				}}
			/>
			{#if isPending(part.image)}
				<PendingReviewBadge />
			{/if}
		</button>
	{:else if part.image && !part.image.url}
		<RejectedImage reason={part.image.rejectionReason} class="h-24 w-24 shrink-0" />
	{/if}
	<div class="w-full min-w-0">
		<h2 class="heading-lg pr-20 text-2xl break-words">{part.name}</h2>
		<p class="text-muted">{part.brand}</p>
		<p class="text-faint mt-1 font-mono text-sm">{ecPartTypeLabel(part.partType)}</p>
		{#if part.notes}
			<p class="text-muted mt-2 text-sm break-words whitespace-pre-line">{part.notes}</p>
		{/if}
	</div>
</div>

<div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
	{#if specs.length > 0}
		<div>
			<h3 class="section-label">Specs</h3>
			<dl class="spec-list">
				{#each specs as [label, value] (label)}
					<div class="spec-row">
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	{#if part.purchase}
		<div>
			<h3 class="section-label">Purchase</h3>
			<PurchaseDetails purchase={part.purchase} {showPrice} />
		</div>
	{/if}
</div>

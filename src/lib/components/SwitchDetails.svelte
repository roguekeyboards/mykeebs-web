<script lang="ts">
	import type { Switch as SwitchModel } from '@roguekeyboards/mykeebs-api-client';
	import PurchaseDetails from '#lib/components/PurchaseDetails.svelte';
	import { isPending } from '#lib/image-moderation.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';

	let {
		sw,
		onImageClick,
		onImageError,
		showPrice
	}: {
		sw: SwitchModel;
		onImageClick: () => void;
		onImageError?: () => void;
		showPrice: boolean;
	} = $props();

	let failedUrl = $state<string | null>(null);
</script>

<div class="flex items-start gap-4 pr-8">
	{#if sw.image?.url && sw.image.url !== failedUrl}
		<button
			type="button"
			class="relative shrink-0 cursor-zoom-in"
			aria-label={isPending(sw.image)
				? 'View full size image, pending review'
				: 'View full size image'}
			onclick={onImageClick}
		>
			<img
				src={sw.image.url}
				alt={sw.name}
				class="kc-thumb h-24 w-24 object-contain"
				decoding="async"
				onerror={() => {
					failedUrl = sw.image?.url ?? null;
					onImageError?.();
				}}
			/>
			{#if isPending(sw.image)}
				<PendingReviewBadge />
			{/if}
		</button>
	{:else if sw.image && !sw.image.url}
		<RejectedImage reason={sw.image.rejectionReason} class="h-24 w-24 shrink-0" />
	{/if}
	<div>
		<h2 class="heading-lg text-2xl">{sw.name}</h2>
		<p class="text-muted">{[sw.brand, sw.manufacturer].filter(Boolean).join(' · ')}</p>
		<p class="text-faint mt-1 font-mono text-sm">
			{[sw.type, sw.factoryLubed ? 'Factory lubed' : undefined].filter(Boolean).join(' · ')}
		</p>
		{#if sw.notes}
			<p class="text-muted mt-2 text-sm">{sw.notes}</p>
		{/if}
	</div>
</div>

<div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
	{#if sw.pins != null || sw.material}
		<div>
			<h3 class="section-label">Construction</h3>
			<dl class="spec-list">
				{#if sw.pins != null}
					<div class="spec-row">
						<dt>Pins</dt>
						<dd>{sw.pins}</dd>
					</div>
				{/if}
				{#if sw.material?.topHousing}
					<div class="spec-row">
						<dt>Top housing</dt>
						<dd>{sw.material.topHousing}</dd>
					</div>
				{/if}
				{#if sw.material?.bottomHousing}
					<div class="spec-row">
						<dt>Bottom housing</dt>
						<dd>{sw.material.bottomHousing}</dd>
					</div>
				{/if}
				{#if sw.material?.stem}
					<div class="spec-row">
						<dt>Stem</dt>
						<dd>{sw.material.stem}</dd>
					</div>
				{/if}
			</dl>
		</div>
	{/if}

	{#if sw.force || sw.spring}
		<div>
			<h3 class="section-label">Feel</h3>
			<dl class="spec-list">
				{#if sw.force?.actuation != null}
					<div class="spec-row">
						<dt>Actuation force</dt>
						<dd>{sw.force.actuation}g</dd>
					</div>
				{/if}
				{#if sw.force?.bottomOut != null}
					<div class="spec-row">
						<dt>Bottom-out force</dt>
						<dd>{sw.force.bottomOut}g</dd>
					</div>
				{/if}
				{#if sw.spring?.material}
					<div class="spec-row">
						<dt>Spring material</dt>
						<dd>{sw.spring.material}</dd>
					</div>
				{/if}
				{#if sw.spring?.preTravel != null}
					<div class="spec-row">
						<dt>Pre-travel</dt>
						<dd>{sw.spring.preTravel}mm</dd>
					</div>
				{/if}
				{#if sw.spring?.totalTravel != null}
					<div class="spec-row">
						<dt>Total travel</dt>
						<dd>{sw.spring.totalTravel}mm</dd>
					</div>
				{/if}
			</dl>
		</div>
	{/if}

	{#if sw.purchase}
		<div>
			<h3 class="section-label">Purchase</h3>
			<PurchaseDetails purchase={sw.purchase} {showPrice} />
		</div>
	{/if}
</div>

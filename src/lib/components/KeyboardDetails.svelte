<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { Keyboard } from '@rogueserenity/kbdb-api-client';
	import PurchaseDetails from '$lib/components/PurchaseDetails.svelte';
	import { formatPrice } from '$lib/format';
	import { pcbLabel, plateLabel } from '$lib/keyboard-parts';

	let {
		keyboard,
		onImageClick,
		onImageError,
		showPrice
	}: {
		keyboard: Keyboard;
		onImageClick: (index: number) => void;
		onImageError?: () => void;
		showPrice: boolean;
	} = $props();

	const failedUrls = new SvelteSet<string>();
	const totalCost = $derived(
		showPrice ? formatPrice(keyboard.totalCost, keyboard.currency) : undefined
	);

	function materialColorText(part: { material?: string; color?: string } | undefined) {
		return part ? [part.color, part.material].filter(Boolean).join(' ') : undefined;
	}
</script>

<div class="pr-8">
	<h2 class="heading-lg text-2xl">{keyboard.name}</h2>
	<p class="text-muted">{keyboard.brand}</p>
	{#if keyboard.size || keyboard.layout}
		<p class="text-faint mt-1 font-mono text-sm">
			{[keyboard.size, keyboard.layout].filter(Boolean).join(' · ')}
		</p>
	{/if}
	{#if keyboard.notes}
		<p class="text-muted mt-2 text-sm">{keyboard.notes}</p>
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

{#if keyboard.images && keyboard.images.length > 0}
	<div class="mt-6">
		<h3 class="section-label">Images</h3>
		<div class="flex flex-wrap gap-3">
			{#each keyboard.images as image, index (image.imageId)}
				{#if !failedUrls.has(image.url)}
					<button
						type="button"
						class="kc-thumb h-20 w-20 shrink-0 overflow-hidden"
						aria-label="View full size image"
						onclick={() => onImageClick(index)}
					>
						<img
							src={image.url}
							alt={keyboard.name}
							class="h-full w-full object-contain"
							loading="lazy"
							decoding="async"
							onerror={() => {
								failedUrls.add(image.url);
								onImageError?.();
							}}
						/>
					</button>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
	{#if keyboard.design}
		<div>
			<h3 class="section-label">Design</h3>
			<dl class="spec-list">
				{#if materialColorText(keyboard.design.topCase)}
					<div class="spec-row">
						<dt>Top case</dt>
						<dd>{materialColorText(keyboard.design.topCase)}</dd>
					</div>
				{/if}
				{#if materialColorText(keyboard.design.bottomCase)}
					<div class="spec-row">
						<dt>Bottom case</dt>
						<dd>{materialColorText(keyboard.design.bottomCase)}</dd>
					</div>
				{/if}
				{#if materialColorText(keyboard.design.weight)}
					<div class="spec-row">
						<dt>Weight</dt>
						<dd>{materialColorText(keyboard.design.weight)}</dd>
					</div>
				{/if}
			</dl>
		</div>
	{/if}

	{#if keyboard.plates && keyboard.plates.length > 0}
		<div>
			<h3 class="section-label">Plates</h3>
			<ul class="flex flex-col gap-4">
				{#each keyboard.plates as plate (plate.id)}
					<li>
						<p class="text-sm font-medium">{plateLabel(plate)}</p>
						{#if plate.purchase}
							<PurchaseDetails purchase={plate.purchase} {showPrice} />
						{:else}
							<p class="text-faint text-xs">Came with the keyboard</p>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if keyboard.pcbs && keyboard.pcbs.length > 0}
		<div>
			<h3 class="section-label">PCBs</h3>
			<ul class="flex flex-col gap-4">
				{#each keyboard.pcbs as pcb (pcb.id)}
					<li>
						<p class="text-sm font-medium">{pcbLabel(pcb)}</p>
						{#if pcb.purchase}
							<PurchaseDetails purchase={pcb.purchase} {showPrice} />
						{:else}
							<p class="text-faint text-xs">Came with the keyboard</p>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if keyboard.purchase}
		<div>
			<h3 class="section-label">Purchase</h3>
			<PurchaseDetails purchase={keyboard.purchase} {showPrice} priceLabel="Base price" />
		</div>
	{/if}
</div>

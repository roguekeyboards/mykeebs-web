<script lang="ts">
	import type { Build } from '@rogueserenity/kbdb-api-client';
	import { formatDate, formatPrice } from '#lib/format.js';
	import { pcbLabel, plateLabel } from '#lib/keyboard-parts.js';
	import { isPending, viewableImages } from '#lib/image-moderation.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';

	let {
		build,
		onKeyboardClick,
		onSwitchClick,
		onKeycapKitClick,
		onImageClick,
		showPrice
	}: {
		build: Build;
		onKeyboardClick: (keyboardId: string) => void;
		onSwitchClick: (switchId: string) => void;
		onKeycapKitClick: (keycapSetId: string, kitId: string) => void;
		onImageClick: (index: number) => void;
		showPrice: boolean;
	} = $props();

	const viewable = $derived(viewableImages(build.images));

	const sortedKeycapKits = $derived(
		[...(build.keycapSets ?? [])]
			.sort((a, b) => a.name.localeCompare(b.name))
			.flatMap((set) => set.kits.map((kit) => ({ set, kit })))
	);
</script>

<div class="pr-8">
	<button
		type="button"
		class="flex items-center gap-3 text-left"
		onclick={() => onKeyboardClick(build.keyboard.id)}
	>
		{#if build.keyboard.imageUrl}
			<img
				src={build.keyboard.imageUrl}
				alt={build.keyboard.name}
				class="kc-thumb h-16 w-16 shrink-0 object-contain"
				decoding="async"
			/>
		{/if}
		<div>
			<h2 class="heading-lg text-2xl hover:underline">{build.keyboard.name}</h2>
			<p class="text-muted">{build.keyboard.brand}</p>
		</div>
	</button>
	{#if formatDate(build.buildDate) || (showPrice && formatPrice(build.totalCost, build.currency))}
		<p class="text-faint mt-1 font-mono text-sm">
			{[
				formatDate(build.buildDate),
				showPrice ? formatPrice(build.totalCost, build.currency) : undefined
			]
				.filter(Boolean)
				.join(' · ')}
		</p>
	{/if}
	{#if build.notes}
		<p class="text-muted mt-2 text-sm">{build.notes}</p>
	{/if}
</div>

{#if build.images && build.images.length > 0}
	<div class="mt-6">
		<h3 class="section-label">Images</h3>
		<div class="flex flex-wrap gap-3">
			{#each build.images as image (image.imageId)}
				{#if image.url === undefined}
					<RejectedImage reason={image.rejectionReason} class="h-20 w-20 shrink-0" />
				{:else}
					<button
						type="button"
						class="kc-thumb relative h-20 w-20 shrink-0 overflow-hidden"
						aria-label={isPending(image)
							? 'View full size image, pending review'
							: 'View full size image'}
						onclick={() => onImageClick(viewable.findIndex((v) => v.imageId === image.imageId))}
					>
						<img
							src={image.url}
							alt="Build"
							class="h-full w-full object-contain"
							loading="lazy"
							decoding="async"
						/>
						{#if isPending(image)}
							<PendingReviewBadge />
						{/if}
					</button>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
	{#if build.plate || build.pcb || build.caseMountType || build.stabs || build.foam != null}
		<div>
			<h3 class="section-label">Build details</h3>
			<dl class="spec-list">
				{#if build.plate}
					<div class="spec-row">
						<dt>Plate</dt>
						<dd>{plateLabel(build.plate)}</dd>
					</div>
				{/if}
				{#if build.pcb}
					<div class="spec-row">
						<dt>PCB</dt>
						<dd>{pcbLabel(build.pcb)}</dd>
					</div>
				{/if}
				{#if build.caseMountType?.type}
					<div class="spec-row">
						<dt>Mount type</dt>
						<dd>
							{[build.caseMountType.type, build.caseMountType.durometer]
								.filter(Boolean)
								.join(' · ')}
						</dd>
					</div>
				{/if}
				{#if build.stabs?.name}
					<div class="spec-row">
						<dt>Stabs</dt>
						<dd>{[build.stabs.name, build.stabs.mountType].filter(Boolean).join(' · ')}</dd>
					</div>
				{/if}
				{#if build.foam != null}
					<div class="spec-row">
						<dt>Foam</dt>
						<dd>{build.foam ? 'Yes' : 'No'}</dd>
					</div>
				{/if}
			</dl>
		</div>
	{/if}

	{#if build.switches && build.switches.length > 0}
		<div>
			<h3 class="section-label">Switches</h3>
			<ul class="space-y-2 text-sm">
				{#each build.switches as entry, index (index)}
					<li>
						<button
							type="button"
							class="flex items-center gap-2 text-left hover:underline"
							onclick={() => onSwitchClick(entry._switch.id)}
						>
							{#if entry._switch.imageUrl}
								<img
									src={entry._switch.imageUrl}
									alt={entry._switch.name}
									class="kc-thumb h-8 w-8 shrink-0 object-contain"
									loading="lazy"
									decoding="async"
								/>
							{/if}
							<span class="font-mono"
								>{entry.count}x {entry._switch.name} ({entry._switch.brand})</span
							>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if sortedKeycapKits.length > 0}
		<div>
			<h3 class="section-label">Keycap kits</h3>
			<ul class="space-y-2 text-sm">
				{#each sortedKeycapKits as { set, kit } (`${set.id}-${kit.kitId}`)}
					<li>
						<button
							type="button"
							class="flex items-center gap-2 text-left hover:underline"
							onclick={() => onKeycapKitClick(set.id, kit.kitId)}
						>
							{#if kit.imageUrl}
								<img
									src={kit.imageUrl}
									alt={kit.name}
									class="kc-thumb h-8 w-8 shrink-0 object-contain"
									loading="lazy"
									decoding="async"
								/>
							{/if}
							<span class="font-mono">{set.name} &mdash; {kit.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

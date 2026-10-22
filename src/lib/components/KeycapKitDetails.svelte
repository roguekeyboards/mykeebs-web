<script lang="ts">
	import PurchaseDetails from '#lib/components/PurchaseDetails.svelte';
	import type { PurchaseLike } from '#lib/format.js';
	import { isPending, type ModeratedImage } from '#lib/image-moderation.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';

	let {
		name,
		image,
		imageFailed,
		onImageError,
		onImageClick,
		purchase,
		showPrice
	}: {
		name: string;
		image: ModeratedImage | undefined;
		imageFailed: boolean;
		onImageError: () => void;
		onImageClick: () => void;
		purchase: PurchaseLike | undefined;
		showPrice: boolean;
	} = $props();

	const imageUrl = $derived(image?.url);
</script>

<div class="grid grid-cols-1 gap-6 pr-8 sm:grid-cols-2">
	{#if imageUrl && !imageFailed}
		<button
			type="button"
			class="relative cursor-zoom-in"
			aria-label={isPending(image)
				? 'View full size image, pending review'
				: 'View full size image'}
			onclick={onImageClick}
		>
			<img
				src={imageUrl}
				alt={name}
				class="kc-thumb max-h-[70vh] w-full object-contain"
				decoding="async"
				onerror={onImageError}
			/>
			{#if isPending(image)}
				<PendingReviewBadge />
			{/if}
		</button>
	{:else if image && !imageUrl}
		<RejectedImage reason={image.rejectionReason} class="aspect-square w-full text-sm" />
	{:else}
		<div class="kc-thumb text-faint flex aspect-square w-full items-center justify-center text-sm">
			No image
		</div>
	{/if}
	<div>
		<h2 class="heading-lg text-2xl">{name}</h2>
		<PurchaseDetails {purchase} {showPrice} />
	</div>
</div>

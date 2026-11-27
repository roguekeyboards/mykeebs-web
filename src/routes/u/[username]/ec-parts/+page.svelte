<script lang="ts">
	import { earliestDate } from '#lib/purchases.js';
	import { pageTitle } from '#lib/page-title.js';
	import type { PageRequest } from '#lib/pagination.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ECPart, ECPartInput } from '@roguekeyboards/mykeebs-api-client';
	import { ResponseError } from '@roguekeyboards/mykeebs-api-client';
	import { ecPartsApi, buildsApi } from '#lib/api/client.js';
	import { anyImageFailed, staleImageRefetcher, withFreshImage } from '#lib/stale-images.js';
	import { formatPrice } from '#lib/format.js';
	import { getUserContext } from '#lib/user-context.js';
	import CollectionGrid from '#lib/components/CollectionGrid.svelte';
	import { ecPartFields } from '#lib/collection-fields.js';
	import Modal from '#lib/components/Modal.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import DeleteBlocked from '#lib/components/DeleteBlocked.svelte';
	import { deleteFailure } from '#lib/delete-blocked.js';
	import { stagedUploadOutcome, uploadImage, uploadEach } from '#lib/upload.js';
	import PageNotice from '#lib/components/PageNotice.svelte';
	import { isPending } from '#lib/image-moderation.js';
	import VisibilityBadge from '#lib/components/VisibilityBadge.svelte';
	import OrderStatusBadge from '#lib/components/OrderStatusBadge.svelte';
	import ImageViewer from '#lib/components/ImageViewer.svelte';
	import ECPartDetails from '#lib/components/ECPartDetails.svelte';
	import ECPartForm from '#lib/components/ECPartForm.svelte';
	import { ecPartSpecs, ecPartTypeLabel } from '#lib/ec-parts.js';

	const userContext = getUserContext();
	const showPrice = $derived(userContext.showPrice);

	type ModalState =
		| { mode: 'view'; part: ECPart }
		| { mode: 'create' }
		| { mode: 'edit'; part: ECPart }
		| { mode: 'closed' };

	let modal = $state<ModalState>({ mode: 'closed' });
	// Keyed by URL, not item id: the API hands back a freshly signed URL when
	// the old one expires, so a new key retries instead of staying hidden.
	let failedImages = new SvelteSet<string>();
	let viewerOpen = $state(false);
	let grid = $state<ReturnType<typeof CollectionGrid<ECPart>> | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let photoNotice = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let blockingBuilds = $state<string[] | null>(null);
	let confirmingDelete = $state(false);
	let form = $state<{ isDirty(): boolean } | null>(null);

	const staleImages = staleImageRefetcher(
		(ecPartId) => ecPartsApi.getECPart({ userId: userContext.userId, ecPartId }),
		(fresh, id) => {
			grid?.updateItem(id, (row) => withFreshImage(row, fresh));
			if (modal.mode === 'view' && modal.part.id === id)
				modal = { mode: 'view', part: withFreshImage(modal.part, fresh) };
		}
	);

	function openPart(part: ECPart) {
		staleImages.reset();
		modal = { mode: 'view', part };
		if (isPending(part.image) || anyImageFailed([part.image?.url], failedImages))
			staleImages.refetch(part.id);
	}

	function openCreate() {
		notice = null;
		saveError = null;
		photoNotice = null;
		modal = { mode: 'create' };
	}

	function openEdit(part: ECPart) {
		saveError = null;
		photoNotice = null;
		modal = { mode: 'edit', part };
	}

	function closeModal() {
		modal = { mode: 'closed' };
		viewerOpen = false;
		saveError = null;
		photoNotice = null;
		deleteError = null;
		blockingBuilds = null;
		confirmingDelete = false;
	}

	async function handleCreate(input: ECPartInput, stagedImage?: File) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		photoNotice = null;
		try {
			const part = await ecPartsApi.createECPart({ userId, eCPartInput: input });
			const photoFailure = await uploadEach(stagedImage ? [stagedImage] : [], (file) =>
				uploadPartImage(part.id, file)
			);
			await grid?.refresh().catch(() => {});
			const photos = stagedUploadOutcome('EC part', photoFailure, true);
			const stillOpen = modal.mode === 'create';
			if (stillOpen && photos.reopen) {
				modal = { mode: 'edit', part };
				photoNotice = photos.message;
			} else {
				if (stillOpen) closeModal();
				notice = photos.message;
			}
		} catch {
			saveError = 'Could not create this EC part.';
		} finally {
			saving = false;
		}
	}

	async function handleUpdate(ecPartId: string, input: ECPartInput) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		photoNotice = null;
		try {
			const part = await ecPartsApi.updateECPart({ userId, ecPartId, eCPartInput: input });
			await grid?.refresh();
			if (modal.mode === 'edit' && modal.part.id === ecPartId) modal = { mode: 'view', part };
		} catch (err) {
			if (err instanceof ResponseError) {
				const body = await err.response.json().catch(() => null);
				console.error('updateECPart failed', err.response.status, body);
			} else {
				console.error('updateECPart failed', err);
			}
			saveError = 'Could not save your changes.';
		} finally {
			saving = false;
		}
	}

	async function refreshEditingPart(ecPartId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		const part = await ecPartsApi.getECPart({ userId, ecPartId });
		await grid?.refresh();
		if (modal.mode === 'edit' && modal.part.id === ecPartId) modal = { mode: 'edit', part };
	}

	async function uploadPartImage(ecPartId: string, file: File) {
		const userId = userContext.userId;
		if (!userId) return;

		await uploadImage(file, (imageUploadRequest) =>
			ecPartsApi.setECPartImage({ userId, ecPartId, imageUploadRequest })
		);
	}

	async function handleImageUpload(ecPartId: string, file: File) {
		photoNotice = null;
		staleImages.cancel();
		await uploadPartImage(ecPartId, file);
		await refreshEditingPart(ecPartId).catch(() => {});
	}

	async function handleImageRemove(ecPartId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		photoNotice = null;
		await ecPartsApi.deleteECPartImage({ userId, ecPartId });
		await refreshEditingPart(ecPartId);
	}

	async function deletePart(ecPartId: string) {
		const userId = userContext.userId;
		if (!userId) return;

		deleting = true;
		deleteError = null;
		try {
			await ecPartsApi.deleteECPart({ userId, ecPartId });
			await grid?.refresh();
			closeModal();
		} catch (err) {
			const failure = await deleteFailure(
				err,
				(buildId) => buildsApi.getBuild({ userId, buildId }),
				{
					stillUsed: 'This EC part is still used by one or more builds.',
					failed: 'Could not delete this EC part.'
				}
			);
			if ('blockingBuilds' in failure) blockingBuilds = failure.blockingBuilds;
			else deleteError = failure.error;
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{pageTitle('EC parts', `@${userContext.username}`)}</title></svelte:head>

{#if notice}
	<PageNotice onDismiss={() => (notice = null)}>{notice}</PageNotice>
{/if}

<CollectionGrid
	bind:this={grid}
	userId={userContext.userId}
	fetchPage={(userId: string, request: PageRequest) =>
		ecPartsApi.listECParts({ userId, ...request })}
	itemKey={(part) => part.id ?? ''}
	emptyMessage="No EC parts yet."
	getName={(part) => part.name}
	searchFields={ecPartFields}
	getOrderStatus={(part) => part.orderStatus}
	onAdd={userContext.isOwnProfile ? openCreate : undefined}
	addLabel="Add EC part"
	onOpen={openPart}
	sortOptions={userContext.isOwnProfile
		? [
				{ label: 'Name', getValue: (part) => part.name },
				{ label: 'Brand', getValue: (part) => part.brand },
				{ label: 'Part type', getValue: (part) => ecPartTypeLabel(part.partType) },
				{ label: 'Order status', getValue: (part) => part.orderStatus },
				{ label: 'Order date', getValue: (part) => earliestDate(part, 'orderDate') },
				{ label: 'Delivery date', getValue: (part) => earliestDate(part, 'deliveryDate') },
				{
					label: 'Estimated delivery',
					getValue: (part) => earliestDate(part, 'estimatedDeliveryDate')
				},
				{ label: 'Price', getValue: (part) => part.totalCost },
				{ label: 'Visibility', getValue: (part) => part.visibility }
			]
		: [
				{ label: 'Name', getValue: (part) => part.name },
				{ label: 'Brand', getValue: (part) => part.brand },
				{ label: 'Part type', getValue: (part) => ecPartTypeLabel(part.partType) },
				{ label: 'Order status', getValue: (part) => part.orderStatus },
				{ label: 'Order date', getValue: (part) => earliestDate(part, 'orderDate') },
				{ label: 'Delivery date', getValue: (part) => earliestDate(part, 'deliveryDate') },
				{
					label: 'Estimated delivery',
					getValue: (part) => earliestDate(part, 'estimatedDeliveryDate')
				}
			]}
>
	{#snippet card(part)}
		{@const imageFailed = part.image?.url != null && failedImages.has(part.image.url)}
		<button
			type="button"
			class="kc-card flex w-full items-start gap-3 p-4 text-left"
			onclick={() => openPart(part)}
		>
			{#if part.image?.url && !imageFailed}
				<img
					src={part.image.url}
					alt={part.name}
					class="kc-thumb h-16 w-16 shrink-0 object-contain"
					loading="lazy"
					decoding="async"
					onerror={() => part.image?.url && failedImages.add(part.image.url)}
				/>
			{/if}
			<div class="min-w-0 flex-1">
				<h2 class="heading-lg truncate text-lg" title={part.name}>{part.name}</h2>
				<p class="text-muted truncate text-sm" title={part.brand}>{part.brand}</p>
				<p class="text-faint truncate font-mono text-xs">
					{[ecPartTypeLabel(part.partType), ...ecPartSpecs(part)].join(' · ')}
				</p>
				{#if formatPrice(part.totalCost, part.currency) || part.orderStatus || part.visibility}
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<p class="text-faint font-mono text-xs">
							{formatPrice(part.totalCost, part.currency)}
						</p>
						<div class="ml-auto flex shrink-0 items-center gap-1.5">
							{#if part.orderStatus}
								<OrderStatusBadge status={part.orderStatus} />
							{/if}
							<VisibilityBadge visibility={part.visibility} />
						</div>
					</div>
				{/if}
			</div>
		</button>
	{/snippet}
</CollectionGrid>

<Modal
	open={modal.mode !== 'closed'}
	onClose={closeModal}
	obscured={viewerOpen}
	isDirty={() => form?.isDirty() ?? false}
>
	{#snippet headerExtra()}
		{#if modal.mode === 'view'}
			<VisibilityBadge visibility={modal.part.visibility} />
			<ShareButton
				id={modal.part.id ?? ''}
				title={modal.part.name}
				visibility={modal.part.visibility}
			/>
		{/if}
	{/snippet}
	{#if modal.mode === 'view'}
		{@const viewedId = modal.part.id}
		<ECPartDetails
			part={modal.part}
			onImageClick={() => (viewerOpen = true)}
			onImageError={() => staleImages.refetch(viewedId)}
			{showPrice}
		/>

		{#if userContext.isOwnProfile}
			{@const part = modal.part}
			<div
				class="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
				style="border-color: var(--border)"
			>
				<button type="button" class="btn" onclick={() => openEdit(part)}>Edit</button>
				{#if blockingBuilds}
					<DeleteBlocked builds={blockingBuilds} onCancel={() => (blockingBuilds = null)} />
				{:else if confirmingDelete}
					<span class="text-sm">Delete "{part.name}"?</span>
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						disabled={deleting}
						onclick={() => deletePart(part.id ?? '')}
					>
						{deleting ? 'Deleting…' : 'Confirm delete'}
					</button>
					<button
						type="button"
						class="btn"
						disabled={deleting}
						onclick={() => (confirmingDelete = false)}
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						onclick={() => (confirmingDelete = true)}
					>
						Delete
					</button>
				{/if}
			</div>
			{#if deleteError}
				<p class="mt-2 text-sm" role="alert" style="color: var(--danger)">{deleteError}</p>
			{/if}
		{/if}
	{:else if modal.mode === 'create'}
		<ECPartForm
			{saving}
			error={saveError}
			onSubmit={handleCreate}
			onCancel={closeModal}
			bind:this={form}
		/>
	{:else if modal.mode === 'edit'}
		{@const part = modal.part}
		<ECPartForm
			initial={part}
			{saving}
			error={saveError ?? photoNotice}
			onSubmit={(input) => handleUpdate(part.id ?? '', input)}
			onCancel={() => {
				modal = { mode: 'view', part };
			}}
			onImageUpload={(file) => handleImageUpload(part.id ?? '', file)}
			onImageRemove={() => handleImageRemove(part.id ?? '')}
			bind:this={form}
		/>
	{/if}
</Modal>

{#if modal.mode === 'view' && modal.part.image?.url}
	<ImageViewer
		open={viewerOpen}
		src={modal.part.image.url}
		alt={modal.part.name}
		onClose={() => (viewerOpen = false)}
	/>
{/if}

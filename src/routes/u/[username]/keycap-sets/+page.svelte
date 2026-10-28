<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import type { PageRequest } from '#lib/pagination.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type {
		KeycapKit,
		KeycapKitInput,
		KeycapSet,
		KeycapSetInput
	} from '@rogueserenity/kbdb-api-client';
	import { ResponseError } from '@rogueserenity/kbdb-api-client';
	import { keycapSetsApi, buildsApi } from '#lib/api/client.js';
	import { anyImageFailed, staleImageRefetcher, withFreshKitImages } from '#lib/stale-images.js';
	import {
		adjacentKitId,
		earliestKitDate,
		kitsWithPhotos,
		primaryKitImageUrl
	} from '#lib/keycap-set.js';
	import { stepIndex } from '#lib/step-index.js';
	import { getUserContext } from '#lib/user-context.js';
	import CollectionGrid from '#lib/components/CollectionGrid.svelte';
	import { keycapSetFields } from '#lib/collection-fields.js';
	import Modal from '#lib/components/Modal.svelte';
	import DeleteBlocked from '#lib/components/DeleteBlocked.svelte';
	import { deleteFailure } from '#lib/delete-blocked.js';
	import { stagedUploadOutcome, uploadImage, uploadEach } from '#lib/upload.js';
	import PageNotice from '#lib/components/PageNotice.svelte';
	import { anyPending } from '#lib/image-moderation.js';
	import VisibilityBadge from '#lib/components/VisibilityBadge.svelte';
	import OrderStatusBadge from '#lib/components/OrderStatusBadge.svelte';
	import ImageViewer from '#lib/components/ImageViewer.svelte';
	import KeycapSetDetails from '#lib/components/KeycapSetDetails.svelte';
	import KeycapSetForm from '#lib/components/KeycapSetForm.svelte';
	import KeycapKitForm from '#lib/components/KeycapKitForm.svelte';
	import KeycapKitDetails from '#lib/components/KeycapKitDetails.svelte';
	import { formatPrice } from '#lib/format.js';
	import { ArrowLeft, ArrowRight } from '@lucide/svelte';

	const userContext = getUserContext();
	const showPrice = $derived(userContext.showPrice);

	type ModalState =
		| { mode: 'view'; set: KeycapSet }
		| { mode: 'create' }
		| { mode: 'edit'; set: KeycapSet }
		| { mode: 'closed' };

	// Kits are named by id and looked up fresh from the current set on each
	// render, so they stay in sync after a save.
	type KitModalState =
		| { mode: 'view'; kitId: string }
		| { mode: 'create' }
		| { mode: 'edit'; kitId: string }
		| { mode: 'closed' };

	let modal = $state<ModalState>({ mode: 'closed' });
	let kitModal = $state<KitModalState>({ mode: 'closed' });
	// Keyed by URL, not item id: the API hands back a freshly signed URL when
	// the old one expires, so a new key retries instead of staying hidden.
	let failedImages = new SvelteSet<string>();
	let kitImageViewerOpen = $state(false);
	let grid = $state<ReturnType<typeof CollectionGrid<KeycapSet>> | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let blockingBuilds = $state<string[] | null>(null);
	let confirmingDelete = $state(false);
	let kitSaving = $state(false);
	let kitSaveError = $state<string | null>(null);
	let kitPhotoNotice = $state<string | null>(null);
	let kitNotice = $state<string | null>(null);
	let kitDeleting = $state(false);
	let kitDeleteError = $state<string | null>(null);
	let kitBlockingBuilds = $state<string[] | null>(null);
	let confirmingKitDelete = $state<string | null>(null);
	let form = $state<{ isDirty(): boolean } | null>(null);
	let kitForm = $state<{ isDirty(): boolean } | null>(null);

	let activeKitId = $derived(
		kitModal.mode === 'view' || kitModal.mode === 'edit' ? kitModal.kitId : null
	);
	let activeKit = $derived(
		modal.mode === 'view' && activeKitId
			? (modal.set.kits?.find((kit) => kit.kitId === activeKitId) ?? null)
			: null
	);

	function stepKit(delta: 1 | -1) {
		if (modal.mode !== 'view' || kitModal.mode !== 'view') return;
		const kitId = adjacentKitId(modal.set, kitModal.kitId, delta);
		if (kitId) kitModal = { mode: 'view', kitId };
	}

	function handleKitNavKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') stepKit(-1);
		else if (event.key === 'ArrowRight') stepKit(1);
	}

	let photoKits = $derived(modal.mode === 'view' ? kitsWithPhotos(modal.set) : []);

	function stepPhotoKit(index: number, delta: 1 | -1) {
		kitModal = { mode: 'view', kitId: photoKits[stepIndex(index, delta, photoKits.length)].kitId };
	}

	let hasMultipleKits = $derived(modal.mode === 'view' ? (modal.set.kits?.length ?? 0) > 1 : false);

	const staleImages = staleImageRefetcher(
		(keycapSetId) => keycapSetsApi.getKeycapSet({ userId: userContext.userId, keycapSetId }),
		(fresh, id) => {
			grid?.updateItem(id, (row) => withFreshKitImages(row, fresh));
			if (modal.mode === 'view' && modal.set.id === id)
				modal = { mode: 'view', set: withFreshKitImages(modal.set, fresh) };
		}
	);

	function openSet(set: KeycapSet) {
		staleImages.reset();
		modal = { mode: 'view', set };
		if (
			anyPending(set.kits?.map((kit) => kit.image)) ||
			anyImageFailed(
				set.kits?.map((kit) => kit.image?.url),
				failedImages
			)
		)
			staleImages.refetch(set.id);
	}

	function openCreate() {
		saveError = null;
		modal = { mode: 'create' };
	}

	function openEdit(set: KeycapSet) {
		saveError = null;
		modal = { mode: 'edit', set };
	}

	function closeModal() {
		kitNotice = null;
		modal = { mode: 'closed' };
		kitModal = { mode: 'closed' };
		kitImageViewerOpen = false;
		saveError = null;
		deleteError = null;
		blockingBuilds = null;
		confirmingDelete = false;
		resetKitState();
	}

	function resetKitState() {
		kitSaveError = null;
		kitPhotoNotice = null;
		kitDeleteError = null;
		kitBlockingBuilds = null;
		confirmingKitDelete = null;
	}

	async function handleCreate(input: KeycapSetInput) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		try {
			const set = await keycapSetsApi.createKeycapSet({ userId, keycapSetInput: input });
			await grid?.refresh();
			// The next step is adding kits, which needs the set's view.
			modal = { mode: 'view', set };
		} catch {
			saveError = 'Could not create this keycap set.';
		} finally {
			saving = false;
		}
	}

	async function handleUpdate(keycapSetId: string, input: KeycapSetInput) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		try {
			const set = await keycapSetsApi.updateKeycapSet({
				userId,
				keycapSetId,
				keycapSetInput: input
			});
			await grid?.refresh();
			modal = { mode: 'view', set };
		} catch (err) {
			if (err instanceof ResponseError) {
				const body = await err.response.json().catch(() => null);
				console.error('updateKeycapSet failed', err.response.status, body);
			} else {
				console.error('updateKeycapSet failed', err);
			}
			saveError = 'Could not save your changes.';
		} finally {
			saving = false;
		}
	}

	async function refreshViewedSet(keycapSetId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		const set = await keycapSetsApi.getKeycapSet({ userId, keycapSetId });
		await grid?.refresh();
		if (modal.mode === 'view') modal = { mode: 'view', set };
		else if (modal.mode === 'edit') modal = { mode: 'edit', set };
	}

	async function deleteSet(keycapSetId: string) {
		const userId = userContext.userId;
		if (!userId) return;

		deleting = true;
		deleteError = null;
		try {
			await keycapSetsApi.deleteKeycapSet({ userId, keycapSetId });
			await grid?.refresh();
			closeModal();
		} catch (err) {
			const failure = await deleteFailure(
				err,
				(buildId) => buildsApi.getBuild({ userId, buildId }),
				{
					stillUsed: 'This keycap set is still used by one or more builds.',
					failed: 'Could not delete this keycap set.'
				}
			);
			if ('blockingBuilds' in failure) blockingBuilds = failure.blockingBuilds;
			else deleteError = failure.error;
		} finally {
			deleting = false;
		}
	}

	function openAddKit() {
		kitNotice = null;
		resetKitState();
		kitModal = { mode: 'create' };
	}

	function openViewKit(kit: KeycapKit) {
		kitNotice = null;
		resetKitState();
		kitImageViewerOpen = false;
		kitModal = { mode: 'view', kitId: kit.kitId };
	}

	function openEditKit(kitId: string) {
		kitNotice = null;
		resetKitState();
		kitModal = { mode: 'edit', kitId };
	}

	function closeKitModal() {
		kitModal = { mode: 'closed' };
		kitImageViewerOpen = false;
		resetKitState();
	}

	async function handleCreateKit(input: KeycapKitInput, stagedImage?: File) {
		const userId = userContext.userId;
		if (modal.mode !== 'view' || !userId) return;
		const keycapSetId = modal.set.id;

		kitSaving = true;
		kitSaveError = null;
		kitPhotoNotice = null;
		try {
			const kit = await keycapSetsApi.createKeycapKit({
				userId,
				keycapSetId,
				keycapKitInput: input
			});
			const photoFailure = await uploadEach(stagedImage ? [stagedImage] : [], (file) =>
				uploadKitImage(keycapSetId, kit.kitId, file)
			);
			await refreshViewedSet(keycapSetId).catch(() => {});
			const shown =
				modal.mode === 'view' ? modal.set.kits?.find((k) => k.kitId === kit.kitId) : undefined;
			const photos = stagedUploadOutcome('kit', photoFailure, shown !== undefined);
			if (photos.reopen) {
				kitModal = { mode: 'edit', kitId: kit.kitId };
				kitPhotoNotice = photos.message;
			} else {
				closeKitModal();
				kitNotice = photos.message;
			}
		} catch {
			kitSaveError = 'Could not create this kit.';
		} finally {
			kitSaving = false;
		}
	}

	async function handleUpdateKit(kitId: string, input: KeycapKitInput) {
		const userId = userContext.userId;
		if (modal.mode !== 'view' || !userId) return;
		const keycapSetId = modal.set.id;

		kitSaving = true;
		kitSaveError = null;
		kitPhotoNotice = null;
		try {
			await keycapSetsApi.updateKeycapKit({ userId, keycapSetId, kitId, keycapKitInput: input });
			await refreshViewedSet(keycapSetId);
			kitModal = { mode: 'view', kitId };
		} catch (err) {
			if (err instanceof ResponseError) {
				const body = await err.response.json().catch(() => null);
				console.error('updateKeycapKit failed', err.response.status, body);
			} else {
				console.error('updateKeycapKit failed', err);
			}
			kitSaveError = 'Could not save your changes.';
		} finally {
			kitSaving = false;
		}
	}

	async function uploadKitImage(keycapSetId: string, kitId: string, file: File) {
		const userId = userContext.userId;
		if (!userId) return;

		await uploadImage(file, (imageUploadRequest) =>
			keycapSetsApi.setKeycapKitImage({ userId, keycapSetId, kitId, imageUploadRequest })
		);
	}

	async function handleKitImageUpload(kitId: string, file: File) {
		if (modal.mode !== 'view') return;
		const keycapSetId = modal.set.id;
		kitPhotoNotice = null;
		staleImages.cancel();
		await uploadKitImage(keycapSetId, kitId, file);
		await refreshViewedSet(keycapSetId).catch(() => {});
	}

	async function handleKitImageRemove(kitId: string) {
		const userId = userContext.userId;
		if (modal.mode !== 'view' || !userId) return;
		const keycapSetId = modal.set.id;
		kitPhotoNotice = null;
		await keycapSetsApi.deleteKeycapKitImage({ userId, keycapSetId, kitId });
		await refreshViewedSet(keycapSetId);
	}

	async function deleteKit(kitId: string) {
		const userId = userContext.userId;
		if (modal.mode !== 'view' || !userId) return;
		const keycapSetId = modal.set.id;

		kitDeleting = true;
		kitDeleteError = null;
		try {
			await keycapSetsApi.deleteKeycapKit({ userId, keycapSetId, kitId });
			await refreshViewedSet(keycapSetId);
			closeKitModal();
			confirmingKitDelete = null;
		} catch (err) {
			const failure = await deleteFailure(
				err,
				(buildId) => buildsApi.getBuild({ userId, buildId }),
				{
					stillUsed: 'This kit is still used by one or more builds.',
					failed: 'Could not delete this kit.'
				}
			);
			if ('blockingBuilds' in failure) kitBlockingBuilds = failure.blockingBuilds;
			else kitDeleteError = failure.error;
		} finally {
			kitDeleting = false;
		}
	}
</script>

<svelte:head><title>{pageTitle('Keycap sets', `@${userContext.username}`)}</title></svelte:head>

<CollectionGrid
	bind:this={grid}
	userId={userContext.userId}
	fetchPage={(userId: string, request: PageRequest) =>
		keycapSetsApi.listKeycapSets({ userId, ...request })}
	itemKey={(set) => set.id ?? ''}
	emptyMessage="No keycap sets yet."
	getName={(set) => set.name}
	searchFields={keycapSetFields}
	getOrderStatus={(set) => set.orderStatus ?? undefined}
	onAdd={userContext.isOwnProfile ? openCreate : undefined}
	addLabel="Add keycap set"
	sortOptions={userContext.isOwnProfile
		? [
				{ label: 'Name', getValue: (set) => set.name },
				{ label: 'Brand', getValue: (set) => set.brand },
				{ label: 'Order status', getValue: (set) => set.orderStatus ?? undefined },
				{ label: 'Order date', getValue: (set) => earliestKitDate(set, 'orderDate') },
				{ label: 'Delivery date', getValue: (set) => earliestKitDate(set, 'deliveryDate') },
				{ label: 'Total cost', getValue: (set) => set.totalCost ?? undefined },
				{ label: 'Visibility', getValue: (set) => set.visibility }
			]
		: [
				{ label: 'Name', getValue: (set) => set.name },
				{ label: 'Brand', getValue: (set) => set.brand },
				{ label: 'Order status', getValue: (set) => set.orderStatus ?? undefined },
				{ label: 'Order date', getValue: (set) => earliestKitDate(set, 'orderDate') },
				{ label: 'Delivery date', getValue: (set) => earliestKitDate(set, 'deliveryDate') }
			]}
>
	{#snippet card(set)}
		{@const imageUrl = primaryKitImageUrl(set)}
		{@const imageFailed = imageUrl != null && failedImages.has(imageUrl)}
		<button
			type="button"
			class="kc-card flex w-full items-start gap-3 overflow-hidden p-3 text-left"
			onclick={() => openSet(set)}
		>
			{#if imageUrl && !imageFailed}
				<img
					src={imageUrl}
					alt={set.name}
					class="kc-thumb h-16 w-16 shrink-0 object-contain"
					loading="lazy"
					decoding="async"
					onerror={() => failedImages.add(imageUrl)}
				/>
			{/if}
			<div class="min-w-0 flex-1">
				<h2 class="heading-lg truncate text-lg" title={set.name}>{set.name}</h2>
				<p class="text-muted truncate text-sm" title={set.brand}>{set.brand}</p>
				{#if set.profile}
					<p class="text-faint font-mono text-xs">{set.profile}</p>
				{/if}
				{#if formatPrice(set.totalCost, set.currency) || set.orderStatus || set.visibility}
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<p class="text-faint font-mono text-xs">{formatPrice(set.totalCost, set.currency)}</p>
						<div class="ml-auto flex shrink-0 items-center gap-1.5">
							{#if set.orderStatus}
								<OrderStatusBadge status={set.orderStatus} />
							{/if}
							<VisibilityBadge visibility={set.visibility} />
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
	obscured={kitModal.mode !== 'closed'}
	isDirty={() => form?.isDirty() ?? false}
>
	{#snippet headerExtra()}
		{#if modal.mode === 'view'}
			<VisibilityBadge visibility={modal.set.visibility} />
		{/if}
	{/snippet}
	{#if modal.mode === 'view'}
		{@const set = modal.set}
		{#if kitNotice}
			<PageNotice class="mb-4" onDismiss={() => (kitNotice = null)}>{kitNotice}</PageNotice>
		{/if}
		<KeycapSetDetails
			{set}
			{failedImages}
			onImageError={(url) => {
				failedImages.add(url);
				staleImages.refetch(set.id);
			}}
			onKitClick={openViewKit}
			onAddKit={userContext.isOwnProfile ? openAddKit : undefined}
			{showPrice}
		/>

		{#if userContext.isOwnProfile}
			<div
				class="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
				style="border-color: var(--border)"
			>
				<button type="button" class="btn" onclick={() => openEdit(set)}>Edit set</button>
				{#if blockingBuilds}
					<DeleteBlocked builds={blockingBuilds} onCancel={() => (blockingBuilds = null)} />
				{:else if confirmingDelete}
					<span class="text-sm">Delete "{set.name}"?</span>
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						disabled={deleting}
						onclick={() => deleteSet(set.id ?? '')}
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
						Delete set
					</button>
				{/if}
			</div>
			{#if deleteError}
				<p class="mt-2 text-sm" role="alert" style="color: var(--danger)">{deleteError}</p>
			{/if}
		{/if}
	{:else if modal.mode === 'create'}
		<KeycapSetForm
			{saving}
			error={saveError}
			onSubmit={handleCreate}
			onCancel={closeModal}
			bind:this={form}
		/>
	{:else if modal.mode === 'edit'}
		{@const set = modal.set}
		<KeycapSetForm
			initial={set}
			{saving}
			error={saveError}
			onSubmit={(input) => handleUpdate(set.id ?? '', input)}
			onCancel={() => {
				modal = { mode: 'view', set };
			}}
			bind:this={form}
		/>
	{/if}
</Modal>

<svelte:window
	onkeydown={kitModal.mode === 'view' && !kitImageViewerOpen ? handleKitNavKeydown : undefined}
/>

<Modal
	open={kitModal.mode !== 'closed'}
	onClose={closeKitModal}
	wide={kitModal.mode === 'view'}
	obscured={kitImageViewerOpen}
	isDirty={() => kitForm?.isDirty() ?? false}
>
	{#snippet headerExtra()}
		{#if kitModal.mode === 'view' && hasMultipleKits}
			<button type="button" class="btn-icon" aria-label="Previous kit" onclick={() => stepKit(-1)}>
				<ArrowLeft class="h-5 w-5" />
			</button>
			<button type="button" class="btn-icon" aria-label="Next kit" onclick={() => stepKit(1)}>
				<ArrowRight class="h-5 w-5" />
			</button>
		{/if}
	{/snippet}

	{#if kitModal.mode === 'create'}
		<KeycapKitForm
			saving={kitSaving}
			error={kitSaveError}
			onSubmit={handleCreateKit}
			onCancel={closeKitModal}
			bind:this={kitForm}
		/>
	{:else if kitModal.mode === 'view' && activeKit}
		{@const kit = activeKit}
		{@const imageFailed = kit.image?.url != null && failedImages.has(kit.image.url)}
		<KeycapKitDetails
			name={kit.name}
			image={kit.image}
			{imageFailed}
			onImageError={() => {
				if (kit.image?.url) failedImages.add(kit.image.url);
				if (modal.mode === 'view') staleImages.refetch(modal.set.id);
			}}
			onImageClick={() => (kitImageViewerOpen = true)}
			purchase={kit.purchase}
			{showPrice}
		/>

		{#if userContext.isOwnProfile}
			<div
				class="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
				style="border-color: var(--border)"
			>
				<button type="button" class="btn" onclick={() => openEditKit(kit.kitId)}>Edit kit</button>
				{#if kitBlockingBuilds}
					<DeleteBlocked builds={kitBlockingBuilds} onCancel={() => (kitBlockingBuilds = null)} />
				{:else if confirmingKitDelete === kit.kitId}
					<span class="text-sm">Delete "{kit.name}"?</span>
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						disabled={kitDeleting}
						onclick={() => deleteKit(kit.kitId)}
					>
						{kitDeleting ? 'Deleting…' : 'Confirm delete'}
					</button>
					<button
						type="button"
						class="btn"
						disabled={kitDeleting}
						onclick={() => (confirmingKitDelete = null)}
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						onclick={() => (confirmingKitDelete = kit.kitId)}
					>
						Delete kit
					</button>
				{/if}
			</div>
			{#if kitDeleteError}
				<p class="mt-2 text-sm" role="alert" style="color: var(--danger)">{kitDeleteError}</p>
			{/if}
		{/if}
	{:else if kitModal.mode === 'edit' && activeKit}
		{@const kit = activeKit}
		<KeycapKitForm
			initial={kit}
			isPrimary={modal.mode === 'view' && modal.set.primaryKitId === kit.kitId}
			saving={kitSaving}
			error={kitSaveError ?? kitPhotoNotice}
			onSubmit={(input) => handleUpdateKit(kit.kitId, input)}
			onCancel={() => {
				kitModal = { mode: 'view', kitId: kit.kitId };
			}}
			onImageUpload={(file) => handleKitImageUpload(kit.kitId, file)}
			onImageRemove={() => handleKitImageRemove(kit.kitId)}
			bind:this={kitForm}
		/>
	{/if}
</Modal>

{#if kitModal.mode === 'view' && activeKit?.image?.url}
	{@const kit = activeKit}
	{@const index = photoKits.findIndex((photoKit) => photoKit.kitId === kit.kitId)}
	<ImageViewer
		open={kitImageViewerOpen}
		src={kit.image?.url ?? ''}
		alt={kit.name}
		onClose={() => (kitImageViewerOpen = false)}
		itemLabel="kit"
		{index}
		count={photoKits.length}
		onPrev={photoKits.length > 1 ? () => stepPhotoKit(index, -1) : undefined}
		onNext={photoKits.length > 1 ? () => stepPhotoKit(index, 1) : undefined}
	/>
{/if}

<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import type { PageRequest } from '#lib/pagination.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Keyboard, KeyboardInput } from '@rogueserenity/kbdb-api-client';
	import { ResponseError } from '@rogueserenity/kbdb-api-client';
	import { keyboardsApi, buildsApi } from '#lib/api/client.js';
	import { anyImageFailed, staleImageRefetcher, withFreshImages } from '#lib/stale-images.js';
	import { formatPrice } from '#lib/format.js';
	import { getUserContext } from '#lib/user-context.js';
	import CollectionGrid from '#lib/components/CollectionGrid.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import DeleteBlocked from '#lib/components/DeleteBlocked.svelte';
	import { deleteFailure } from '#lib/delete-blocked.js';
	import type { KeyboardParts } from '#lib/keyboard-parts.js';
	import { blockedRemovalMessage, removeParts, saveParts } from '#lib/keyboard-parts-save.js';
	import { stepIndex } from '#lib/step-index.js';
	import {
		stagedUploadFollowUp,
		stagedUploadOutcome,
		uploadImage,
		uploadStaged
	} from '#lib/upload.js';
	import PageNotice from '#lib/components/PageNotice.svelte';
	import { anyPending, primaryImageUrl, viewableImages } from '#lib/image-moderation.js';
	import ImageViewer from '#lib/components/ImageViewer.svelte';
	import KeyboardDetails from '#lib/components/KeyboardDetails.svelte';
	import KeyboardForm from '#lib/components/KeyboardForm.svelte';
	import VisibilityBadge from '#lib/components/VisibilityBadge.svelte';
	import OrderStatusBadge from '#lib/components/OrderStatusBadge.svelte';

	const userContext = getUserContext();
	const showPrice = $derived(userContext.showPrice);

	type ModalState =
		| { mode: 'view'; keyboard: Keyboard }
		| { mode: 'create' }
		| { mode: 'edit'; keyboard: Keyboard }
		| { mode: 'closed' };

	let modal = $state<ModalState>({ mode: 'closed' });
	// Keyed by URL, not item id: the API hands back a freshly signed URL when
	// the old one expires, so a new key retries instead of staying hidden.
	let failedImages = new SvelteSet<string>();
	let galleryViewerOpen = $state(false);
	let galleryIndex = $state(0);
	const galleryImages = $derived(
		modal.mode === 'view' ? viewableImages(modal.keyboard.images) : []
	);
	let grid = $state<ReturnType<typeof CollectionGrid<Keyboard>> | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let blockingBuilds = $state<string[] | null>(null);
	let confirmingDelete = $state(false);
	let form = $state<{ isDirty(): boolean } | null>(null);

	const staleImages = staleImageRefetcher(
		(keyboardId) => keyboardsApi.getKeyboard({ userId: userContext.userId, keyboardId }),
		(fresh, id) => {
			grid?.updateItem(id, (row) => withFreshImages(row, fresh));
			if (modal.mode === 'view' && modal.keyboard.id === id)
				modal = { mode: 'view', keyboard: withFreshImages(modal.keyboard, fresh) };
		}
	);

	function openKeyboard(keyboard: Keyboard) {
		staleImages.reset();
		modal = { mode: 'view', keyboard };
		if (
			anyPending(keyboard.images) ||
			anyImageFailed(
				keyboard.images?.map((image) => image.url),
				failedImages
			)
		)
			staleImages.refetch(keyboard.id);
	}

	function openCreate() {
		notice = null;
		saveError = null;
		modal = { mode: 'create' };
	}

	function openEdit(keyboard: Keyboard) {
		saveError = null;
		modal = { mode: 'edit', keyboard };
	}

	function closeModal() {
		modal = { mode: 'closed' };
		galleryViewerOpen = false;
		galleryIndex = 0;
		saveError = null;
		deleteError = null;
		blockingBuilds = null;
		confirmingDelete = false;
	}

	async function handleCreate(
		input: KeyboardInput,
		stagedImages: File[] | undefined,
		parts: KeyboardParts
	) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		let keyboard: Keyboard;
		try {
			keyboard = await keyboardsApi.createKeyboard({ userId, keyboardInput: input });
		} catch {
			saveError = 'Could not create this keyboard.';
			saving = false;
			return;
		}
		try {
			const partsSaved = await saveParts(keyboardsApi, userId, keyboard, parts).then(
				() => true,
				() => false
			);
			const photoFailure = await uploadStaged(stagedImages ?? [], (file) =>
				uploadKeyboardImage(keyboard.id, file)
			);
			await grid?.refresh().catch(() => {});
			const photos = stagedUploadOutcome('keyboard', photoFailure, true);
			if (partsSaved && !photos.reopen) {
				closeModal();
				notice = photos.message;
			} else {
				const fresh = await keyboardsApi
					.getKeyboard({ userId, keyboardId: keyboard.id })
					.catch(() => keyboard);
				modal = { mode: 'edit', keyboard: fresh };
				saveError = partsSaved
					? photos.message
					: [
							"The keyboard was added, but some of its plates or PCBs weren't. Add them again and save.",
							photoFailure && stagedUploadFollowUp('keyboard', photoFailure)
						]
							.filter(Boolean)
							.join(' ');
			}
		} finally {
			saving = false;
		}
	}

	async function handleUpdate(saved: Keyboard, input: KeyboardInput, parts: KeyboardParts) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		try {
			const blocked = await removeParts(keyboardsApi, userId, saved, parts);
			if (blocked.length > 0) {
				saveError = await blockedRemovalMessage(blocked, (buildId) =>
					buildsApi.getBuild({ userId, buildId })
				);
				await refreshEditingKeyboard(saved.id).catch(() => {});
				return;
			}
			await keyboardsApi.updateKeyboard({ userId, keyboardId: saved.id, keyboardInput: input });
			await saveParts(keyboardsApi, userId, saved, parts);
			const keyboard = await keyboardsApi.getKeyboard({ userId, keyboardId: saved.id });
			await grid?.refresh();
			modal = { mode: 'view', keyboard };
		} catch (err) {
			if (err instanceof ResponseError) {
				const body = await err.response.json().catch(() => null);
				console.error('updateKeyboard failed', err.response.status, body);
			} else {
				console.error('updateKeyboard failed', err);
			}
			saveError = 'Could not save your changes.';
			await refreshEditingKeyboard(saved.id).catch(() => {});
		} finally {
			saving = false;
		}
	}

	async function refreshEditingKeyboard(keyboardId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		const keyboard = await keyboardsApi.getKeyboard({ userId, keyboardId });
		await grid?.refresh();
		if (modal.mode === 'edit') modal = { mode: 'edit', keyboard };
	}

	async function uploadKeyboardImage(keyboardId: string, file: File) {
		const userId = userContext.userId;
		if (!userId) return;

		await uploadImage(file, (imageUploadRequest) =>
			keyboardsApi.createKeyboardImage({ userId, keyboardId, imageUploadRequest })
		);
	}

	async function handleImageUpload(keyboardId: string, file: File) {
		await uploadKeyboardImage(keyboardId, file);
		await refreshEditingKeyboard(keyboardId);
	}

	async function handleImageRemove(keyboardId: string, imageId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		await keyboardsApi.deleteKeyboardImage({ userId, keyboardId, imageId });
		galleryIndex = 0;
		await refreshEditingKeyboard(keyboardId);
	}

	async function deleteKeyboard(keyboardId: string) {
		const userId = userContext.userId;
		if (!userId) return;

		deleting = true;
		deleteError = null;
		try {
			await keyboardsApi.deleteKeyboard({ userId, keyboardId });
			await grid?.refresh();
			closeModal();
		} catch (err) {
			const failure = await deleteFailure(
				err,
				(buildId) => buildsApi.getBuild({ userId, buildId }),
				{
					stillUsed: 'This keyboard is still used by one or more builds.',
					failed: 'Could not delete this keyboard.'
				}
			);
			if ('blockingBuilds' in failure) blockingBuilds = failure.blockingBuilds;
			else deleteError = failure.error;
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{pageTitle('Keyboards', `@${userContext.username}`)}</title></svelte:head>

{#if notice}
	<PageNotice onDismiss={() => (notice = null)}>{notice}</PageNotice>
{/if}

<CollectionGrid
	bind:this={grid}
	userId={userContext.userId}
	fetchPage={(userId: string, request: PageRequest) =>
		keyboardsApi.listKeyboards({ userId, ...request })}
	itemKey={(keyboard) => keyboard.id ?? ''}
	emptyMessage="No keyboards yet."
	getName={(keyboard) => keyboard.name}
	getOrderStatus={(keyboard) => keyboard.purchase?.orderStatus}
	onAdd={userContext.isOwnProfile ? openCreate : undefined}
	addLabel="Add keyboard"
	sortOptions={userContext.isOwnProfile
		? [
				{ label: 'Name', getValue: (keyboard) => keyboard.name },
				{ label: 'Brand', getValue: (keyboard) => keyboard.brand },
				{ label: 'Order status', getValue: (keyboard) => keyboard.purchase?.orderStatus },
				{ label: 'Order date', getValue: (keyboard) => keyboard.purchase?.orderDate?.getTime() },
				{
					label: 'Delivery date',
					getValue: (keyboard) => keyboard.purchase?.deliveryDate?.getTime()
				},
				{ label: 'Total cost', getValue: (keyboard) => keyboard.totalCost ?? undefined },
				{ label: 'Visibility', getValue: (keyboard) => keyboard.visibility }
			]
		: [
				{ label: 'Name', getValue: (keyboard) => keyboard.name },
				{ label: 'Brand', getValue: (keyboard) => keyboard.brand },
				{ label: 'Order status', getValue: (keyboard) => keyboard.purchase?.orderStatus },
				{ label: 'Order date', getValue: (keyboard) => keyboard.purchase?.orderDate?.getTime() },
				{
					label: 'Delivery date',
					getValue: (keyboard) => keyboard.purchase?.deliveryDate?.getTime()
				}
			]}
>
	{#snippet card(keyboard)}
		{@const imageUrl = primaryImageUrl(keyboard.images)}
		{@const imageFailed = imageUrl != null && failedImages.has(imageUrl)}
		<button
			type="button"
			class="kc-card flex w-full items-start gap-3 p-4 text-left"
			onclick={() => openKeyboard(keyboard)}
		>
			{#if imageUrl && !imageFailed}
				<img
					src={imageUrl}
					alt={keyboard.name}
					class="kc-thumb h-16 w-16 shrink-0 object-contain"
					loading="lazy"
					decoding="async"
					onerror={() => failedImages.add(imageUrl)}
				/>
			{/if}
			<div class="min-w-0 flex-1">
				<h2 class="heading-lg truncate text-lg" title={keyboard.name}>{keyboard.name}</h2>
				<p class="text-muted truncate text-sm" title={keyboard.brand}>{keyboard.brand}</p>
				{#if keyboard.size || keyboard.layout}
					<p class="text-faint font-mono text-xs">
						{[keyboard.size, keyboard.layout].filter(Boolean).join(' · ')}
					</p>
				{/if}
				{#if formatPrice(keyboard.totalCost, keyboard.currency) || keyboard.purchase?.orderStatus || keyboard.visibility}
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<p class="text-faint font-mono text-xs">
							{formatPrice(keyboard.totalCost, keyboard.currency)}
						</p>
						<div class="ml-auto flex shrink-0 items-center gap-1.5">
							{#if keyboard.purchase?.orderStatus}
								<OrderStatusBadge status={keyboard.purchase.orderStatus} />
							{/if}
							<VisibilityBadge visibility={keyboard.visibility} />
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
	obscured={galleryViewerOpen}
	isDirty={() => form?.isDirty() ?? false}
>
	{#snippet headerExtra()}
		{#if modal.mode === 'view'}
			<VisibilityBadge visibility={modal.keyboard.visibility} />
		{/if}
	{/snippet}
	{#if modal.mode === 'view'}
		{@const viewedId = modal.keyboard.id}
		<KeyboardDetails
			keyboard={modal.keyboard}
			onImageError={() => staleImages.refetch(viewedId)}
			onImageClick={(index) => {
				galleryIndex = index;
				galleryViewerOpen = true;
			}}
			{showPrice}
		/>

		{#if userContext.isOwnProfile}
			{@const keyboard = modal.keyboard}
			<div
				class="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
				style="border-color: var(--border)"
			>
				<button type="button" class="btn" onclick={() => openEdit(keyboard)}>Edit</button>
				{#if blockingBuilds}
					<DeleteBlocked builds={blockingBuilds} onCancel={() => (blockingBuilds = null)} />
				{:else if confirmingDelete}
					<span class="text-sm">Delete "{keyboard.name}"?</span>
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						disabled={deleting}
						onclick={() => deleteKeyboard(keyboard.id ?? '')}
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
		<KeyboardForm
			{saving}
			error={saveError}
			onSubmit={handleCreate}
			onCancel={closeModal}
			bind:this={form}
		/>
	{:else if modal.mode === 'edit'}
		{@const keyboard = modal.keyboard}
		<KeyboardForm
			initial={keyboard}
			{saving}
			error={saveError}
			onSubmit={(input, _images, parts) => handleUpdate(keyboard, input, parts)}
			onCancel={() => {
				modal = { mode: 'view', keyboard };
			}}
			onImageUpload={(file) => handleImageUpload(keyboard.id ?? '', file)}
			onImageRemove={(imageId) => handleImageRemove(keyboard.id ?? '', imageId)}
			bind:this={form}
		/>
	{/if}
</Modal>

{#if modal.mode === 'view' && galleryImages.length > 0}
	{@const images = galleryImages}
	<ImageViewer
		open={galleryViewerOpen}
		src={images[Math.min(galleryIndex, images.length - 1)].url}
		alt={modal.keyboard.name}
		onClose={() => (galleryViewerOpen = false)}
		onPrev={images.length > 1
			? () => (galleryIndex = stepIndex(galleryIndex, -1, images.length))
			: undefined}
		onNext={images.length > 1
			? () => (galleryIndex = stepIndex(galleryIndex, 1, images.length))
			: undefined}
	/>
{/if}

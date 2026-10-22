<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Switch as SwitchModel, SwitchInput } from '@rogueserenity/kbdb-api-client';
	import { ResponseError } from '@rogueserenity/kbdb-api-client';
	import { switchesApi, buildsApi } from '#lib/api/client.js';
	import { anyImageFailed, staleImageRefetcher, withFreshImage } from '#lib/stale-images.js';
	import { formatPrice } from '#lib/format.js';
	import { getUserContext } from '#lib/user-context.js';
	import CollectionGrid from '#lib/components/CollectionGrid.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import DeleteBlocked from '#lib/components/DeleteBlocked.svelte';
	import { deleteFailure } from '#lib/delete-blocked.js';
	import { stagedUploadOutcome, uploadImage, uploadStaged } from '#lib/upload.js';
	import PageNotice from '#lib/components/PageNotice.svelte';
	import { isPending } from '#lib/image-moderation.js';
	import VisibilityBadge from '#lib/components/VisibilityBadge.svelte';
	import OrderStatusBadge from '#lib/components/OrderStatusBadge.svelte';
	import ImageViewer from '#lib/components/ImageViewer.svelte';
	import SwitchDetails from '#lib/components/SwitchDetails.svelte';
	import SwitchForm from '#lib/components/SwitchForm.svelte';

	const userContext = getUserContext();
	const showPrice = $derived(userContext.showPrice);

	type ModalState =
		| { mode: 'view'; sw: SwitchModel }
		| { mode: 'create' }
		| { mode: 'edit'; sw: SwitchModel }
		| { mode: 'closed' };

	let modal = $state<ModalState>({ mode: 'closed' });
	// Keyed by URL, not item id: the API hands back a freshly signed URL when
	// the old one expires, so a new key retries instead of staying hidden.
	let failedImages = new SvelteSet<string>();
	let viewerOpen = $state(false);
	let grid = $state<ReturnType<typeof CollectionGrid<SwitchModel>> | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let blockingBuilds = $state<string[] | null>(null);
	let confirmingDelete = $state(false);
	let form = $state<{ isDirty(): boolean } | null>(null);

	const staleImages = staleImageRefetcher(
		(switchId) => switchesApi.getSwitch({ userId: userContext.userId, switchId }),
		(fresh, id) => {
			grid?.updateItem(id, (row) => withFreshImage(row, fresh));
			if (modal.mode === 'view' && modal.sw.id === id)
				modal = { mode: 'view', sw: withFreshImage(modal.sw, fresh) };
		}
	);

	function openSwitch(sw: SwitchModel) {
		staleImages.reset();
		modal = { mode: 'view', sw };
		if (isPending(sw.image) || anyImageFailed([sw.image?.url], failedImages))
			staleImages.refetch(sw.id);
	}

	function openCreate() {
		notice = null;
		saveError = null;
		modal = { mode: 'create' };
	}

	function openEdit(sw: SwitchModel) {
		saveError = null;
		modal = { mode: 'edit', sw };
	}

	function closeModal() {
		modal = { mode: 'closed' };
		viewerOpen = false;
		saveError = null;
		deleteError = null;
		blockingBuilds = null;
		confirmingDelete = false;
	}

	async function handleCreate(input: SwitchInput, stagedImage?: File) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		try {
			const sw = await switchesApi.createSwitch({ userId, switchInput: input });
			const photoFailure = await uploadStaged(stagedImage ? [stagedImage] : [], (file) =>
				uploadSwitchImage(sw.id, file)
			);
			await grid?.refresh().catch(() => {});
			const photos = stagedUploadOutcome('switch', photoFailure, true);
			if (photos.reopen) {
				modal = { mode: 'edit', sw };
				saveError = photos.message;
			} else {
				closeModal();
				notice = photos.message;
			}
		} catch {
			saveError = 'Could not create this switch.';
		} finally {
			saving = false;
		}
	}

	async function handleUpdate(switchId: string, input: SwitchInput) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		try {
			const sw = await switchesApi.updateSwitch({ userId, switchId, switchInput: input });
			await grid?.refresh();
			modal = { mode: 'view', sw };
		} catch (err) {
			if (err instanceof ResponseError) {
				const body = await err.response.json().catch(() => null);
				console.error('updateSwitch failed', err.response.status, body);
			} else {
				console.error('updateSwitch failed', err);
			}
			saveError = 'Could not save your changes.';
		} finally {
			saving = false;
		}
	}

	async function refreshEditingSwitch(switchId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		const sw = await switchesApi.getSwitch({ userId, switchId });
		await grid?.refresh();
		if (modal.mode === 'edit') modal = { mode: 'edit', sw };
	}

	async function uploadSwitchImage(switchId: string, file: File) {
		const userId = userContext.userId;
		if (!userId) return;

		await uploadImage(file, (imageUploadRequest) =>
			switchesApi.setSwitchImage({ userId, switchId, imageUploadRequest })
		);
	}

	async function handleImageUpload(switchId: string, file: File) {
		staleImages.cancel();
		await uploadSwitchImage(switchId, file);
		await refreshEditingSwitch(switchId);
	}

	async function handleImageRemove(switchId: string) {
		const userId = userContext.userId;
		if (!userId) return;
		await switchesApi.deleteSwitchImage({ userId, switchId });
		await refreshEditingSwitch(switchId);
	}

	async function deleteSwitch(switchId: string) {
		const userId = userContext.userId;
		if (!userId) return;

		deleting = true;
		deleteError = null;
		try {
			await switchesApi.deleteSwitch({ userId, switchId });
			await grid?.refresh();
			closeModal();
		} catch (err) {
			const failure = await deleteFailure(
				err,
				(buildId) => buildsApi.getBuild({ userId, buildId }),
				{
					stillUsed: 'This switch is still used by one or more builds.',
					failed: 'Could not delete this switch.'
				}
			);
			if ('blockingBuilds' in failure) blockingBuilds = failure.blockingBuilds;
			else deleteError = failure.error;
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{pageTitle('Switches', `@${userContext.username}`)}</title></svelte:head>

{#if notice}
	<PageNotice onDismiss={() => (notice = null)}>{notice}</PageNotice>
{/if}

<CollectionGrid
	bind:this={grid}
	userId={userContext.userId}
	fetchPage={(userId: string, cursor: string | undefined) =>
		switchesApi.listSwitches({ userId, cursor })}
	itemKey={(sw) => sw.id ?? ''}
	emptyMessage="No switches yet."
	getName={(sw) => sw.name}
	getOrderStatus={(sw) => sw.purchase?.orderStatus}
	onAdd={userContext.isOwnProfile ? openCreate : undefined}
	addLabel="Add switch"
	sortOptions={userContext.isOwnProfile
		? [
				{ label: 'Name', getValue: (sw) => sw.name },
				{ label: 'Brand', getValue: (sw) => sw.brand },
				{ label: 'Order status', getValue: (sw) => sw.purchase?.orderStatus },
				{ label: 'Order date', getValue: (sw) => sw.purchase?.orderDate?.getTime() },
				{ label: 'Delivery date', getValue: (sw) => sw.purchase?.deliveryDate?.getTime() },
				{ label: 'Price', getValue: (sw) => sw.purchase?.price },
				{ label: 'Visibility', getValue: (sw) => sw.visibility }
			]
		: [
				{ label: 'Name', getValue: (sw) => sw.name },
				{ label: 'Brand', getValue: (sw) => sw.brand },
				{ label: 'Order status', getValue: (sw) => sw.purchase?.orderStatus },
				{ label: 'Order date', getValue: (sw) => sw.purchase?.orderDate?.getTime() },
				{ label: 'Delivery date', getValue: (sw) => sw.purchase?.deliveryDate?.getTime() }
			]}
>
	{#snippet card(sw)}
		{@const imageFailed = sw.image?.url != null && failedImages.has(sw.image.url)}
		<button
			type="button"
			class="kc-card flex w-full items-start gap-3 p-4 text-left"
			onclick={() => openSwitch(sw)}
		>
			{#if sw.image?.url && !imageFailed}
				<img
					src={sw.image.url}
					alt={sw.name}
					class="kc-thumb h-16 w-16 shrink-0 object-contain"
					loading="lazy"
					decoding="async"
					onerror={() => sw.image?.url && failedImages.add(sw.image.url)}
				/>
			{/if}
			<div class="min-w-0 flex-1">
				<h2 class="heading-lg truncate text-lg" title={sw.name}>{sw.name}</h2>
				<p class="text-muted truncate text-sm" title={sw.brand}>{sw.brand}</p>
				{#if sw.type}
					<p class="text-faint font-mono text-xs">{sw.type}</p>
				{/if}
				{#if formatPrice(sw.purchase?.price, sw.purchase?.currency) || sw.purchase?.orderStatus || sw.visibility}
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<p class="text-faint font-mono text-xs">
							{formatPrice(sw.purchase?.price, sw.purchase?.currency)}
						</p>
						<div class="ml-auto flex shrink-0 items-center gap-1.5">
							{#if sw.purchase?.orderStatus}
								<OrderStatusBadge status={sw.purchase?.orderStatus} />
							{/if}
							<VisibilityBadge visibility={sw.visibility} />
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
			<VisibilityBadge visibility={modal.sw.visibility} />
		{/if}
	{/snippet}
	{#if modal.mode === 'view'}
		{@const viewedId = modal.sw.id}
		<SwitchDetails
			sw={modal.sw}
			onImageClick={() => (viewerOpen = true)}
			onImageError={() => staleImages.refetch(viewedId)}
			{showPrice}
		/>

		{#if userContext.isOwnProfile}
			{@const sw = modal.sw}
			<div
				class="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
				style="border-color: var(--border)"
			>
				<button type="button" class="btn" onclick={() => openEdit(sw)}>Edit</button>
				{#if blockingBuilds}
					<DeleteBlocked builds={blockingBuilds} onCancel={() => (blockingBuilds = null)} />
				{:else if confirmingDelete}
					<span class="text-sm">Delete "{sw.name}"?</span>
					<button
						type="button"
						class="btn"
						style="color: var(--danger)"
						disabled={deleting}
						onclick={() => deleteSwitch(sw.id ?? '')}
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
		<SwitchForm
			{saving}
			error={saveError}
			onSubmit={handleCreate}
			onCancel={closeModal}
			bind:this={form}
		/>
	{:else if modal.mode === 'edit'}
		{@const sw = modal.sw}
		<SwitchForm
			initial={sw}
			{saving}
			error={saveError}
			onSubmit={(input) => handleUpdate(sw.id ?? '', input)}
			onCancel={() => {
				modal = { mode: 'view', sw };
			}}
			onImageUpload={(file) => handleImageUpload(sw.id ?? '', file)}
			onImageRemove={() => handleImageRemove(sw.id ?? '')}
			bind:this={form}
		/>
	{/if}
</Modal>

{#if modal.mode === 'view' && modal.sw.image?.url}
	<ImageViewer
		open={viewerOpen}
		src={modal.sw.image.url}
		alt={modal.sw.name}
		onClose={() => (viewerOpen = false)}
	/>
{/if}

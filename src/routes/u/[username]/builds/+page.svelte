<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { BuildInput } from '@rogueserenity/kbdb-api-client';
	import { resolve } from '$app/paths';
	import { buildsApi } from '#lib/api/client.js';
	import { fetchAllPages } from '#lib/pagination.js';
	import { stagedUploadMessage, uploadImage, uploadEach } from '#lib/upload.js';
	import { primaryImageUrl } from '#lib/image-moderation.js';
	import PageNotice from '#lib/components/PageNotice.svelte';
	import { groupByKeyboard, type KeyboardBuildGroup } from '#lib/build-groups.js';
	import { perItemImageRefetcher, withFreshImages } from '#lib/stale-images.js';
	import {
		STALE_REFS_MESSAGE,
		staleBuildRefsFromError,
		type StaleBuildRefs
	} from '#lib/build-refs.js';
	import { formatDate, formatPrice } from '#lib/format.js';
	import { getUserContext } from '#lib/user-context.js';
	import CollectionGrid from '#lib/components/CollectionGrid.svelte';
	import { buildFields } from '#lib/collection-fields.js';
	import Modal from '#lib/components/Modal.svelte';
	import BuildForm from '#lib/components/BuildForm.svelte';
	import VisibilityBadge from '#lib/components/VisibilityBadge.svelte';

	const userContext = getUserContext();
	const showPrice = $derived(userContext.showPrice);

	// Grouping needs every build up front, so they're handed back as one page.
	async function fetchGroupedBuilds(userId: string) {
		const allBuilds = await fetchAllPages((request) =>
			buildsApi.listBuilds({ userId, ...request })
		);
		return { items: groupByKeyboard(allBuilds) };
	}

	type FormMode = { mode: 'create' } | { mode: 'closed' };

	// Keyed by URL, not item id: the API hands back a freshly signed URL when
	// the old one expires, so a new key retries instead of staying hidden.
	let failedImages = new SvelteSet<string>();
	const refetchStaleImages = perItemImageRefetcher(
		(buildId) => buildsApi.getBuild({ userId: userContext.userId, buildId }),
		(fresh, buildId) =>
			grid?.updateItem(fresh.keyboard.id, (group) =>
				group.current.id === buildId
					? { ...group, current: withFreshImages(group.current, fresh) }
					: group
			)
	);
	let formMode = $state<FormMode>({ mode: 'closed' });
	let grid = $state<ReturnType<typeof CollectionGrid<KeyboardBuildGroup>> | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let notice = $state<{ message: string; keyboardId: string } | null>(null);
	let staleRefs = $state<StaleBuildRefs | null>(null);
	let form = $state<{ isDirty(): boolean } | null>(null);

	function closeModal() {
		formMode = { mode: 'closed' };
		saveError = null;
		staleRefs = null;
	}

	function openCreate() {
		notice = null;
		saveError = null;
		staleRefs = null;
		formMode = { mode: 'create' };
	}

	async function handleCreate(input: BuildInput, stagedImages?: File[]) {
		const userId = userContext.userId;
		if (!userId) return;

		saving = true;
		saveError = null;
		try {
			const build = await buildsApi.createBuild({ userId, buildInput: input });
			const photoFailure = await uploadEach(stagedImages ?? [], (file) =>
				uploadBuildImage(build.id, file)
			);
			await grid?.refresh().catch(() => {});
			closeModal();
			if (photoFailure)
				notice = {
					message: stagedUploadMessage('build', photoFailure, false),
					keyboardId: build.keyboard.id
				};
		} catch (err) {
			staleRefs = await staleBuildRefsFromError(err, input);
			saveError = staleRefs ? STALE_REFS_MESSAGE : 'Could not create this build.';
		} finally {
			saving = false;
		}
	}

	async function uploadBuildImage(buildId: string, file: File) {
		const userId = userContext.userId;
		if (!userId) return;

		await uploadImage(file, (imageUploadRequest) =>
			buildsApi.createBuildImage({ userId, buildId, imageUploadRequest })
		);
	}
</script>

<svelte:head><title>{pageTitle('Builds', `@${userContext.username}`)}</title></svelte:head>

{#if notice}
	<PageNotice onDismiss={() => (notice = null)}>
		{notice.message}
		<a
			class="underline"
			href={resolve('/u/[username]/builds/[keyboardId]', {
				username: userContext.username,
				keyboardId: notice.keyboardId
			})}>See this keyboard's builds</a
		>
	</PageNotice>
{/if}

<CollectionGrid
	bind:this={grid}
	userId={userContext.userId}
	fetchPage={fetchGroupedBuilds}
	itemKey={(group) => group.keyboardId}
	emptyMessage="No builds yet."
	getName={(group) => group.current.keyboard.name}
	searchFields={buildFields}
	onAdd={userContext.isOwnProfile ? openCreate : undefined}
	addLabel="Add build"
	sortOptions={[
		{ label: 'Name', getValue: (group) => group.current.keyboard.name },
		{ label: 'Build Date', getValue: (group) => group.current.buildDate?.getTime() },
		{ label: 'Total cost', getValue: (group) => group.current.totalCost ?? undefined }
	]}
>
	{#snippet card(group)}
		{@const build = group.current}
		{@const imageUrl = primaryImageUrl(build.images)}
		{@const imageFailed = imageUrl != null && failedImages.has(imageUrl)}
		<a
			href={resolve('/u/[username]/builds/[keyboardId]', {
				username: userContext.username,
				keyboardId: group.keyboardId
			})}
			class="kc-card flex w-full items-center gap-3 overflow-hidden p-3 text-left"
		>
			{#if imageUrl && !imageFailed}
				<img
					src={imageUrl}
					alt={build.keyboard.name}
					class="kc-thumb h-24 w-24 shrink-0 object-contain"
					loading="lazy"
					decoding="async"
					onerror={() => {
						failedImages.add(imageUrl);
						refetchStaleImages(build.id);
					}}
				/>
			{/if}
			<div class="pr-4">
				<h2 class="heading-lg text-lg">{build.keyboard.name}</h2>
				<p class="text-muted text-sm">{build.keyboard.brand}</p>
				{#if formatDate(build.buildDate) || (showPrice && formatPrice(build.totalCost, build.currency))}
					<p class="text-faint font-mono text-xs">
						{[
							formatDate(build.buildDate),
							showPrice ? formatPrice(build.totalCost, build.currency) : undefined
						]
							.filter(Boolean)
							.join(' · ')}
					</p>
				{/if}
				<div class="mt-1 flex flex-wrap items-center gap-2">
					<VisibilityBadge visibility={build.visibility} mixed={group.mixedVisibility} />
					{#if group.buildCount > 1}
						<p class="text-faint text-xs">{group.buildCount} builds</p>
					{/if}
				</div>
			</div>
		</a>
	{/snippet}
</CollectionGrid>

<Modal
	open={formMode.mode === 'create'}
	onClose={closeModal}
	wide
	isDirty={() => form?.isDirty() ?? false}
>
	{#if formMode.mode === 'create'}
		<BuildForm
			{saving}
			error={saveError}
			{staleRefs}
			onSubmit={handleCreate}
			onCancel={closeModal}
			bind:this={form}
		/>
	{/if}
</Modal>

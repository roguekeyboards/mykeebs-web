<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { buildsApi, keyboardsApi, switchesApi, keycapSetsApi } from '#lib/api/client.js';
	import { formatPrice } from '#lib/format.js';
	import { getUserContext } from '#lib/user-context.js';
	import { resolve } from '$app/paths';
	import {
		STATUS_FILTERS,
		statusFilterIcon,
		statusFilterLabel,
		type StatusFilter
	} from '#lib/order-status.js';
	import {
		collectionStats,
		countsFor,
		totalsFor,
		type CollectionStats,
		type Tally
	} from '#lib/collection-stats.js';

	const userContext = getUserContext();
	const showPrices = $derived(userContext.showPrice);

	let statusFilter = $state<StatusFilter>('all');

	let stats = $state<CollectionStats | null>(null);
	let countsLoading = $state(false);

	async function fetchAll<T>(
		fetchPage: (cursor: string | undefined) => Promise<{
			items?: T[];
			nextCursor?: string | null;
		}>
	): Promise<T[]> {
		const all: T[] = [];
		let cursor: string | undefined;
		do {
			const pageResult = await fetchPage(cursor);
			all.push(...(pageResult.items ?? []));
			cursor = pageResult.nextCursor ?? undefined;
		} while (cursor);
		return all;
	}

	// The API scopes these to what the viewer may see.
	async function loadCounts(userId: string) {
		countsLoading = true;
		try {
			const [keyboards, switches, keycapSets, builds] = await Promise.all([
				fetchAll((cursor) => keyboardsApi.listKeyboards({ userId, cursor })),
				fetchAll((cursor) => switchesApi.listSwitches({ userId, cursor })),
				fetchAll((cursor) => keycapSetsApi.listKeycapSets({ userId, cursor })),
				fetchAll((cursor) => buildsApi.listBuilds({ userId, cursor }))
			]);
			stats = collectionStats({ keyboards, switches, keycapSets, builds });
		} catch {
			stats = null;
		} finally {
			countsLoading = false;
		}
	}

	$effect(() => {
		if (userContext.userId) loadCounts(userContext.userId);
	});

	const profile = $derived(userContext.profile);

	const counts = $derived<Tally | null>(stats ? countsFor(stats, statusFilter) : null);
	const totals = $derived<Tally | null>(stats ? totalsFor(stats, statusFilter) : null);

	const currency = $derived(stats?.currency);

	const grandTotal = $derived(
		totals ? totals.keyboards + totals.switches + totals.keycapSets : null
	);

	const statTiles = $derived(
		counts
			? [
					{
						label: 'Keyboards',
						value: counts.keyboards,
						price: totals?.keyboards,
						href: resolve('/u/[username]/keyboards', { username: userContext.username })
					},
					{
						label: 'Switches',
						value: counts.switches,
						price: totals?.switches,
						href: resolve('/u/[username]/switches', { username: userContext.username })
					},
					{
						label: 'Keycap Sets',
						value: counts.keycapSets,
						price: totals?.keycapSets,
						href: resolve('/u/[username]/keycap-sets', { username: userContext.username })
					},
					{
						label: 'Builds',
						value: counts.builds,
						price: totals?.builds,
						href: resolve('/u/[username]/builds', { username: userContext.username })
					}
				]
			: []
	);
</script>

<svelte:head><title>{pageTitle(`@${userContext.username}`)}</title></svelte:head>

{#if profile.discordUsername || profile.bio || (profile.links && profile.links.length > 0)}
	<div class="mb-8 flex flex-col gap-5">
		{#if profile.discordUsername}
			<div>
				<h2 class="section-label">Discord</h2>
				<p class="text-muted font-mono text-sm">{profile.discordUsername}</p>
			</div>
		{/if}
		{#if profile.bio}
			<div>
				<h2 class="section-label">Bio</h2>
				<p class="text-muted max-w-prose text-sm">{profile.bio}</p>
			</div>
		{/if}
		{#if profile.links && profile.links.length > 0}
			<div>
				<h2 class="section-label">Links</h2>
				<div class="flex flex-wrap gap-x-4 gap-y-1">
					{#each profile.links as link (link.url)}
						<a
							href={link.url}
							class="text-sm hover:underline"
							style="color: var(--accent-strong)"
							target="_blank"
							rel="noopener noreferrer nofollow external"
						>
							{link.name}
						</a>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<div>
	<div class="mb-4 flex justify-center">
		<div class="segmented-control" role="group" aria-label="Filter by order status">
			{#each STATUS_FILTERS as filter (filter)}
				{@const Icon = statusFilterIcon(filter)}
				<button
					type="button"
					class="segmented-control-btn status-filter-btn"
					class:segmented-control-btn-active={statusFilter === filter}
					aria-pressed={statusFilter === filter}
					title={statusFilterLabel(filter)}
					onclick={() => (statusFilter = filter)}
				>
					<Icon class="h-4 w-4 shrink-0" />
					<span class="status-filter-label">{statusFilterLabel(filter)}</span>
				</button>
			{/each}
		</div>
	</div>
	{#if countsLoading && !counts}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="kc-card p-4">
					<p class="text-faint font-mono text-xs">&nbsp;</p>
				</div>
			{/each}
		</div>
	{:else if counts}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each statTiles as tile (tile.label)}
				<a href={tile.href} class="kc-card block p-4">
					<p class="section-label mb-1">{tile.label}</p>
					<div class="flex items-end justify-between gap-2">
						<p class="heading-lg text-3xl" style="font-family: var(--font-display)">
							{tile.value}
						</p>
						{#if showPrices && formatPrice(tile.price, currency)}
							<p class="text-faint font-mono text-xs">{formatPrice(tile.price, currency)}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
		{#if showPrices && formatPrice(grandTotal ?? undefined, currency)}
			<p class="text-muted mt-4 text-center text-sm">
				Total spent: <span class="font-mono">{formatPrice(grandTotal ?? undefined, currency)}</span>
			</p>
		{/if}
	{:else}
		<p class="text-muted text-sm">Could not load this collection's stats.</p>
	{/if}
</div>

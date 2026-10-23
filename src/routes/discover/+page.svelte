<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Profile } from '@rogueserenity/kbdb-api-client';
	import { profilesApi } from '#lib/api/client.js';
	import Avatar from '#lib/components/Avatar.svelte';

	let query = $state('');
	let results = $state<Profile[]>([]);
	let nextCursor = $state<string | null>(null);
	// kbdb only accepts a cursor with the filter it came from, which can differ
	// from the box's text while a debounced search is pending.
	let resultsFilter: string | undefined;
	let loading = $state(false);
	let loadingMore = $state(false);
	let loadError = $state<string | null>(null);
	let loadMoreError = $state<string | null>(null);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	function onInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(runSearch, 250);
	}

	let loadToken = 0;

	async function runSearch() {
		const token = ++loadToken;
		const username = query.trim() || undefined;
		loading = true;
		loadingMore = false;
		loadError = null;
		loadMoreError = null;
		try {
			const page = await profilesApi.listProfiles({ username });
			if (token !== loadToken) return;
			results = page.items ?? [];
			nextCursor = page.nextCursor ?? null;
			resultsFilter = username;
		} catch {
			if (token !== loadToken) return;
			loadError = 'Could not load the directory.';
			results = [];
			nextCursor = null;
		} finally {
			if (token === loadToken) loading = false;
		}
	}

	async function loadMore() {
		if (!nextCursor) return;
		const token = loadToken;
		loadingMore = true;
		loadMoreError = null;
		try {
			const page = await profilesApi.listProfiles({
				username: resultsFilter,
				cursor: nextCursor
			});
			if (token !== loadToken) return;
			results = [...results, ...(page.items ?? [])];
			nextCursor = page.nextCursor ?? null;
		} catch {
			if (token !== loadToken) return;
			loadMoreError = 'Could not load more results.';
		} finally {
			if (token === loadToken) loadingMore = false;
		}
	}

	onMount(() => {
		runSearch();
		return () => clearTimeout(debounceTimer);
	});
</script>

<svelte:head><title>{pageTitle('Discover')}</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-10">
	<h1 class="heading-lg text-2xl">Discover builders</h1>
	<p class="text-muted mt-1 text-sm">
		Search for other collectors and browse the boards they've shared publicly.
	</p>

	<input
		name="search"
		type="search"
		class="field-input mt-6 w-full"
		placeholder="Search by username..."
		bind:value={query}
		oninput={onInput}
	/>

	<div class="mt-6 flex flex-col gap-3">
		{#if loading}
			<p class="text-muted p-8 text-center text-sm" role="status">Loading&hellip;</p>
		{:else if loadError}
			<p class="p-8 text-center text-sm" role="alert" style="color: var(--danger)">{loadError}</p>
		{:else if results.length === 0}
			<p class="text-muted p-8 text-center text-sm" role="status">No builders match that search.</p>
		{:else}
			{#each results as summary (summary.userId)}
				<a
					href={resolve('/u/[username]', { username: summary.username ?? '' })}
					class="kc-card user-card p-4"
				>
					<Avatar name={summary.username ?? '?'} imageUrl={summary.avatar?.url} size="sm" />
					<div class="min-w-0 flex-1">
						<h2 class="heading-lg text-sm">@{summary.username}</h2>
						{#if summary.discordUsername}
							<p class="text-faint font-mono text-xs">{summary.discordUsername}</p>
						{/if}
					</div>
				</a>
			{/each}
			{#if loadMoreError}
				<p class="text-center text-sm" role="alert" style="color: var(--danger)">{loadMoreError}</p>
			{/if}
			{#if nextCursor}
				<button type="button" class="btn mx-auto mt-2" disabled={loadingMore} onclick={loadMore}>
					{loadingMore ? 'Loading…' : loadMoreError ? 'Try again' : 'Load more'}
				</button>
			{/if}
		{/if}
	</div>
</div>

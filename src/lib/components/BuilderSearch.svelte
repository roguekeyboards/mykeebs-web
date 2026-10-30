<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Profile } from '@roguekeyboards/kbdb-api-client';
	import { profilesApi } from '#lib/api/client.js';
	import Avatar from '#lib/components/Avatar.svelte';

	let { class: className = '' }: { class?: string } = $props();

	let searchQuery = $state('');
	let searchResults = $state<Profile[]>([]);
	let searchOpen = $state(false);
	let searchLoading = $state(false);
	let searchFailed = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	function onSearchInput() {
		clearTimeout(debounceTimer);
		if (!searchQuery.trim()) {
			searchToken++;
			searchResults = [];
			searchOpen = false;
			searchLoading = false;
			searchFailed = false;
			return;
		}
		debounceTimer = setTimeout(runSearch, 250);
	}

	let searchToken = 0;

	async function runSearch() {
		const username = searchQuery.trim();
		if (!username) return;
		const token = ++searchToken;
		searchLoading = true;
		try {
			const result = await profilesApi.listProfiles({ username, limit: 6 });
			if (token !== searchToken) return;
			searchResults = result.items ?? [];
			searchFailed = false;
			searchOpen = true;
		} catch {
			if (token !== searchToken) return;
			searchResults = [];
			searchFailed = true;
			searchOpen = true;
		} finally {
			if (token === searchToken) searchLoading = false;
		}
	}

	function goToProfile(username: string) {
		searchQuery = '';
		searchResults = [];
		searchOpen = false;
		goto(resolve('/u/[username]', { username }));
	}

	function closeIfFocusLeft(event: FocusEvent) {
		const area = event.currentTarget as HTMLElement;
		if (!area.contains(event.relatedTarget as Node | null)) searchOpen = false;
	}
</script>

<div class="relative {className}" onfocusout={closeIfFocusLeft}>
	<input
		name="search"
		type="search"
		class="field-input w-56"
		placeholder="Find a builder…"
		bind:value={searchQuery}
		oninput={onSearchInput}
		onfocus={() => searchResults.length > 0 && (searchOpen = true)}
	/>
	{#if searchOpen}
		<div
			class="absolute top-full right-0 z-50 mt-1 w-64 overflow-hidden rounded-md"
			style="background: var(--surface); border: 1px solid var(--border)"
		>
			{#if searchLoading}
				<p class="text-muted p-3 text-sm" role="status">Searching&hellip;</p>
			{:else if searchFailed}
				<p class="p-3 text-sm" role="alert" style="color: var(--danger)">
					Search failed. Try again.
				</p>
			{:else if searchResults.length === 0}
				<p class="text-muted p-3 text-sm" role="status">No builders match that search.</p>
			{:else}
				{#each searchResults as summary (summary.userId)}
					<button
						type="button"
						class="user-card flex w-full items-center gap-2 p-2 text-left"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => goToProfile(summary.username ?? '')}
					>
						<Avatar name={summary.username ?? '?'} imageUrl={summary.avatar?.url} size="sm" />
						<div class="min-w-0 flex-1">
							<p class="heading-lg truncate text-sm" title={summary.username}>
								@{summary.username}
							</p>
							{#if summary.discordUsername}
								<p class="text-faint truncate font-mono text-xs" title={summary.discordUsername}>
									{summary.discordUsername}
								</p>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>

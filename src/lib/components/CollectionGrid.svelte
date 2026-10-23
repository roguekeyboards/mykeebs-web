<script lang="ts" generics="T">
	import { updateWhere } from '#lib/stale-images.js';
	import { fetchAllPages } from '#lib/pagination.js';
	import { filterByStatus, searchItems, sortItems } from '#lib/collection-filter.js';
	import type { Snippet } from 'svelte';
	import { ArrowDown, ArrowUp, Plus, Search } from '@lucide/svelte';
	import {
		STATUS_FILTERS,
		statusFilterIcon,
		statusFilterLabel,
		type StatusFilter
	} from '#lib/order-status.js';

	type Page = { items?: T[]; nextCursor?: string | null };
	type SortOption = { label: string; getValue: (item: T) => string | number | undefined };

	let {
		userId,
		fetchPage,
		itemKey,
		emptyMessage,
		sortOptions,
		getName,
		getOrderStatus,
		onAdd,
		addLabel,
		card
	}: {
		userId: string;
		fetchPage: (userId: string, cursor: string | undefined) => Promise<Page>;
		itemKey: (item: T) => string;
		emptyMessage: string;
		sortOptions: SortOption[];
		getName: (item: T) => string | undefined;
		getOrderStatus?: (item: T) => string | undefined;
		onAdd?: () => void;
		addLabel?: string;
		card: Snippet<[T]>;
	} = $props();

	let statusFilter = $state<StatusFilter>('all');

	let items = $state<T[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let filterText = $state('');
	let filterExpanded = $state(false);
	let filterInput = $state<HTMLInputElement | null>(null);

	function expandFilter() {
		filterExpanded = true;
		requestAnimationFrame(() => filterInput?.focus());
	}

	function collapseFilterIfEmpty() {
		if (!filterText) filterExpanded = false;
	}

	function handleFilterKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			filterText = '';
			filterExpanded = false;
			filterInput?.blur();
		}
	}

	let filteredItems = $derived(
		searchItems(filterByStatus(items, statusFilter, getOrderStatus), filterText)
	);

	let sortIndex = $state(0);
	let sortDescending = $state(false);

	let sortedItems = $derived.by(() => {
		const option = sortOptions[sortIndex];
		return option
			? sortItems(filteredItems, option.getValue, getName, sortDescending)
			: filteredItems;
	});

	let loadToken = 0;

	async function load() {
		if (!userId) return;

		const token = ++loadToken;
		loadError = null;
		loading = true;
		try {
			const allItems = await fetchAllPages((cursor) => fetchPage(userId, cursor));
			if (token !== loadToken) return;
			items = allItems;
		} catch {
			if (token !== loadToken) return;
			loadError = 'Could not load this collection.';
		} finally {
			if (token === loadToken) loading = false;
		}
	}

	// Lets parents reload without remounting, which would reset filter/sort/search.
	export function updateItem(key: string, update: (item: T) => T) {
		items = updateWhere(items, (item) => itemKey(item) === key, update);
	}

	export async function refresh() {
		await load();
	}

	$effect(() => {
		load();
	});
</script>

{#if loading}
	<div class="flex items-center justify-center p-16">
		<p class="text-muted font-mono text-sm tracking-wide" role="status">Loading&hellip;</p>
	</div>
{:else if loadError}
	<div class="flex items-center justify-center p-16">
		<p class="text-lg" role="alert" style="color: var(--danger)">{loadError}</p>
	</div>
{:else}
	{#if getOrderStatus}
		<div class="mt-4 flex justify-center px-4">
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
	{/if}
	<div class="flex items-center justify-end gap-2 p-4 pb-0">
		{#if sortOptions.length > 0}
			<select
				name="sort"
				class="field-select sort-select"
				class:sort-select-hidden={filterExpanded}
				aria-label="Sort by"
				bind:value={sortIndex}
			>
				{#each sortOptions as option, index (option.label)}
					<option value={index}>Sort: {option.label}</option>
				{/each}
			</select>
			<button
				type="button"
				class="btn-icon shrink-0"
				aria-label={sortDescending ? 'Sort ascending' : 'Sort descending'}
				onclick={() => (sortDescending = !sortDescending)}
			>
				{#if sortDescending}
					<ArrowDown class="h-5 w-5" />
				{:else}
					<ArrowUp class="h-5 w-5" />
				{/if}
			</button>
		{/if}
		{#if filterExpanded}
			<input
				name="filter"
				bind:this={filterInput}
				type="search"
				class="field-input w-full min-w-0 sm:w-64 sm:flex-none"
				placeholder="Filter…"
				aria-label="Filter"
				bind:value={filterText}
				onblur={collapseFilterIfEmpty}
				onkeydown={handleFilterKeydown}
			/>
		{:else}
			<button type="button" class="btn-icon shrink-0" aria-label="Filter" onclick={expandFilter}>
				<Search class="mx-auto h-5 w-5" />
			</button>
		{/if}
		{#if onAdd}
			<button
				type="button"
				class="btn-icon btn-accent shrink-0"
				aria-label={addLabel ?? 'Add'}
				onclick={onAdd}
			>
				<Plus class="mx-auto h-5 w-5" />
			</button>
		{/if}
	</div>
	{#if sortedItems.length === 0}
		<div class="flex items-center justify-center p-16">
			<p class="text-muted text-xl font-semibold" role="status">
				{items.length === 0 ? emptyMessage : 'No matches.'}
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each sortedItems as item (itemKey(item))}
				{@render card(item)}
			{/each}
		</div>
	{/if}
{/if}

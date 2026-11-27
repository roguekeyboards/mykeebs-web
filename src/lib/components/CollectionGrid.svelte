<script lang="ts" generics="T">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { updateWhere } from '#lib/stale-images.js';
	import { fetchAllPages, type PageRequest } from '#lib/pagination.js';
	import {
		filterByFields,
		filterByStatus,
		searchCollection,
		sortItems,
		type FieldFilter,
		type SearchField
	} from '#lib/collection-filter.js';
	import CollectionSearch from './CollectionSearch.svelte';
	import PageNotice from './PageNotice.svelte';
	import { syncViewWithUrl } from '#lib/url-view.svelte.js';
	import { sortSlug, type View } from '#lib/view-params.js';
	import type { Snippet } from 'svelte';
	import { ArrowDown, ArrowUp, Plus } from '@lucide/svelte';
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
		searchFields = [],
		getName,
		getOrderStatus,
		onAdd,
		addLabel,
		onOpen,
		card
	}: {
		userId: string;
		fetchPage: (userId: string, request: PageRequest) => Promise<Page>;
		itemKey: (item: T) => string;
		emptyMessage: string;
		sortOptions: SortOption[];
		searchFields?: SearchField<T>[];
		getName: (item: T) => string | undefined;
		getOrderStatus?: (item: T) => string | undefined;
		onAdd?: () => void;
		addLabel?: string;
		onOpen?: (item: T) => void;
		card: Snippet<[T]>;
	} = $props();

	let statusFilter = $state<StatusFilter>('all');

	let items = $state<T[]>([]);
	let loadedUserId = $state<string | null>(null);
	let loadFailed = $state(false);
	let filterText = $state('');
	let fieldFilters = $state<FieldFilter[]>([]);
	let filterExpanded = $state(false);
	let missingItem = $state(false);

	let filteredItems = $derived(
		searchCollection(
			filterByStatus(items, statusFilter, getOrderStatus),
			searchFields,
			filterText,
			fieldFilters
		)
	);

	let sortIndex = $state(0);
	let sortDescending = $state(false);

	// The first sort is the default, so it never needs to be in the address.
	const sortSlugs = $derived(sortOptions.map((option) => sortSlug(option.label)));

	function applyView(view: View) {
		statusFilter = view.status;
		fieldFilters = view.filters;
		filterText = view.text;
		filterExpanded = view.filters.length > 0 || view.text !== '';
		sortIndex = view.sort ? Math.max(sortSlugs.indexOf(view.sort), 0) : 0;
		sortDescending = view.descending;
	}

	applyView(
		syncViewWithUrl(
			() => ({ tags: searchFields.map((field) => field.tag), sorts: sortSlugs.slice(1) }),
			() => ({
				status: statusFilter,
				filters: fieldFilters,
				text: filterText,
				sort: sortIndex > 0 ? (sortSlugs[sortIndex] ?? null) : null,
				descending: sortDescending
			}),
			applyView
		)
	);

	let sortedItems = $derived.by(() => {
		const option = sortOptions[sortIndex];
		return option
			? sortItems(filteredItems, option.getValue, getName, sortDescending)
			: filteredItems;
	});

	let loadToken = 0;

	async function load() {
		if (!userId) return;

		const requestedUserId = userId;
		const token = ++loadToken;
		loadFailed = false;
		try {
			const allItems = await fetchAllPages((request) => fetchPage(requestedUserId, request));
			if (token !== loadToken) return;
			items = allItems;
			loadedUserId = requestedUserId;
			openRequestedItem();
		} catch {
			if (token !== loadToken) return;
			loadFailed = true;
		}
	}

	function openRequestedItem() {
		missingItem = false;
		const key = page.url.searchParams.get('open');
		if (key === null) return;
		const url = new URL(page.url.href);
		url.searchParams.delete('open');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, query only
		replaceState(url, page.state);
		const item = items.find((i) => itemKey(i) === key);
		if (item) onOpen?.(item);
		else missingItem = true;
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

{#if loadedUserId !== userId}
	<div class="flex items-center justify-center p-16">
		{#if loadFailed}
			<p class="text-lg" role="alert" style="color: var(--danger)">
				Could not load this collection.
			</p>
		{:else}
			<p class="text-muted font-mono text-sm tracking-wide" role="status">Loading&hellip;</p>
		{/if}
	</div>
{:else}
	{#if loadFailed}
		<p class="px-4 pt-4 text-center text-sm" role="alert" style="color: var(--danger)">
			Could not refresh this list, so it may be out of date.
		</p>
	{/if}
	{#if missingItem}
		<PageNotice onDismiss={() => (missingItem = false)}>
			That item isn't available. It may be private, or it may have been deleted.
		</PageNotice>
	{/if}
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
					<option value={index}>{option.label}</option>
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
		<CollectionSearch
			items={filterByFields(
				filterByStatus(items, statusFilter, getOrderStatus),
				searchFields,
				fieldFilters
			)}
			fields={searchFields}
			bind:text={filterText}
			bind:filters={fieldFilters}
			bind:expanded={filterExpanded}
		/>
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

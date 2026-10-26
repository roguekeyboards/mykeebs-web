<script lang="ts" module>
	// ItemPicker fully unmounts when its host closes it, so without a
	// parent-held cache every reopen re-fetches the whole collection.
	export type ItemPickerCache<T> = { items: T[] | null };
</script>

<script lang="ts" generics="T">
	import { untrack } from 'svelte';
	import { fetchAllPages, type PageRequest } from '#lib/pagination.js';
	let {
		userId,
		fetchPage,
		itemKey,
		getLabel,
		getSublabel,
		getImageUrl,
		placeholder = 'Search…',
		onPick,
		onCancel,
		cache
	}: {
		userId: string;
		fetchPage: (
			userId: string,
			request: PageRequest
		) => Promise<{
			items?: T[];
			nextCursor?: string | null;
		}>;
		itemKey: (item: T) => string;
		getLabel: (item: T) => string | undefined;
		getSublabel?: (item: T) => string | undefined;
		getImageUrl?: (item: T) => string | undefined;
		placeholder?: string;
		onPick: (item: T) => void;
		onCancel?: () => void;
		cache?: ItemPickerCache<T>;
	} = $props();

	let items = $state<T[]>(untrack(() => cache?.items ?? []));
	let loading = $state(untrack(() => cache?.items == null));
	let loadError = $state<string | null>(null);

	const label = $derived(placeholder.replace(/…$/, ''));

	let loadToken = 0;
	let filterText = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	// Modal's own open-effect fires only when the Modal opens, not when a
	// picker opens inside an already-open one.
	$effect(() => {
		searchInput?.focus();
	});

	let filteredItems = $derived.by(() => {
		const needle = filterText.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((item) => {
			const label = getLabel(item)?.toLowerCase() ?? '';
			const sublabel = getSublabel?.(item)?.toLowerCase() ?? '';
			return label.includes(needle) || sublabel.includes(needle);
		});
	});

	let activeIndex = $state(0);

	$effect(() => {
		// A new filter always re-clamps.
		void filteredItems;
		activeIndex = 0;
	});

	function clampIndex(index: number): number {
		if (filteredItems.length === 0) return 0;
		return Math.max(0, Math.min(index, filteredItems.length - 1));
	}

	function scrollActiveIntoView() {
		listEl
			?.querySelector<HTMLElement>('[data-active="true"]')
			?.scrollIntoView({ block: 'nearest' });
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				activeIndex = clampIndex(activeIndex + 1);
				scrollActiveIntoView();
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = clampIndex(activeIndex - 1);
				scrollActiveIntoView();
				break;
			case 'Home':
				event.preventDefault();
				activeIndex = 0;
				scrollActiveIntoView();
				break;
			case 'End':
				event.preventDefault();
				activeIndex = clampIndex(filteredItems.length - 1);
				scrollActiveIntoView();
				break;
			case 'Enter':
				event.preventDefault();
				if (filteredItems[activeIndex]) onPick(filteredItems[activeIndex]);
				break;
			case 'Escape':
				if (filterText) {
					event.preventDefault();
					filterText = '';
				} else if (onCancel) {
					event.preventDefault();
					onCancel();
				}
				break;
		}
	}

	$effect(() => {
		if (!userId) return;
		if (cache?.items) {
			loadToken++;
			items = cache.items;
			loading = false;
			return;
		}

		const token = ++loadToken;
		loadError = null;
		loading = true;
		fetchAllPages((request) => fetchPage(userId, request))
			.then((allItems) => {
				if (token !== loadToken) return;
				items = allItems;
				if (cache) cache.items = allItems;
			})
			.catch(() => {
				if (token !== loadToken) return;
				loadError = 'Could not load this collection.';
			})
			.finally(() => {
				if (token === loadToken) loading = false;
			});
	});
</script>

<div class="flex flex-col gap-2">
	<input
		name="search"
		bind:this={searchInput}
		type="search"
		class="field-input"
		{placeholder}
		aria-label={label}
		bind:value={filterText}
		autocomplete="off"
		data-autofocus
		role="combobox"
		aria-expanded="true"
		aria-controls="item-picker-listbox"
		aria-activedescendant={filteredItems[activeIndex]
			? `item-picker-option-${itemKey(filteredItems[activeIndex])}`
			: undefined}
		onkeydown={handleSearchKeydown}
	/>
	<div
		bind:this={listEl}
		id="item-picker-listbox"
		role="listbox"
		aria-label={label}
		class="max-h-64 overflow-y-auto rounded border"
		style="border-color: var(--border)"
	>
		{#if loading}
			<p class="text-muted p-4 text-center text-sm" role="status">Loading&hellip;</p>
		{:else if loadError}
			<p class="p-4 text-center text-sm" role="alert" style="color: var(--danger)">{loadError}</p>
		{:else if filteredItems.length === 0}
			<p class="text-muted p-4 text-center text-sm" role="status">No matches.</p>
		{:else}
			{#each filteredItems as item, index (itemKey(item))}
				<button
					id="item-picker-option-{itemKey(item)}"
					type="button"
					role="option"
					tabindex="-1"
					aria-selected={index === activeIndex}
					data-active={index === activeIndex}
					class="kc-picker-row flex w-full items-center gap-3 border-b p-2 text-left last:border-b-0"
					class:kc-picker-row-active={index === activeIndex}
					style="border-color: var(--border)"
					onmouseenter={() => (activeIndex = index)}
					onclick={() => onPick(item)}
				>
					{#if getImageUrl?.(item)}
						<img
							src={getImageUrl(item)}
							alt=""
							class="kc-thumb h-10 w-10 shrink-0 object-contain"
							loading="lazy"
							decoding="async"
						/>
					{/if}
					<div class="min-w-0">
						<p class="truncate text-sm font-medium">{getLabel(item)}</p>
						{#if getSublabel?.(item)}
							<p class="text-muted truncate text-xs">{getSublabel(item)}</p>
						{/if}
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>

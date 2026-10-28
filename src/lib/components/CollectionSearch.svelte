<script lang="ts" generics="T">
	import { Search, X } from '@lucide/svelte';
	import {
		fieldSuggestions,
		parseFieldQuery,
		type FieldFilter,
		type SearchField
	} from '#lib/collection-filter.js';

	let {
		items,
		fields,
		text = $bindable(''),
		filters = $bindable([]),
		expanded = $bindable(false)
	}: {
		// The items value suggestions come from: whatever the other filters still leave showing.
		items: T[];
		fields: SearchField<T>[];
		text?: string;
		filters?: FieldFilter[];
		expanded?: boolean;
	} = $props();

	const uid = $props.id();
	const listboxId = `${uid}-options`;

	type Option =
		| { id: string; kind: 'field'; field: SearchField<T> }
		| { id: string; kind: 'value'; tag: string; value: string };

	let input = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	let focused = $state(false);
	let dismissed = $state(false);
	let activeIndex = $state(-1);
	let announcement = $state('');

	const typing = $derived(parseFieldQuery(text, fields));

	const options = $derived.by((): Option[] => {
		if (typing) {
			const tag = typing.field.tag;
			const chipped = new Set(
				filters.filter((filter) => filter.tag === tag).map((filter) => filter.value.toLowerCase())
			);
			return fieldSuggestions(items, typing.field, typing.query)
				.filter((value) => !chipped.has(value.toLowerCase()))
				.map((value, index) => ({
					id: `${uid}-value-${index}`,
					kind: 'value',
					tag,
					value
				}));
		}
		if (text.includes(':')) return [];
		const typed = text.trim().toLowerCase();
		return fields
			.filter((field) => field.tag.startsWith(typed))
			.map((field) => ({ id: `${uid}-field-${field.tag}`, kind: 'field', field }));
	});

	const panelOpen = $derived(focused && !dismissed && options.length > 0);

	$effect(() => {
		// New options never keep a highlight, so Enter on plain text doesn't pick one by surprise.
		void options;
		activeIndex = -1;
	});

	function expand() {
		expanded = true;
		requestAnimationFrame(() => input?.focus());
	}

	function addFilter(filter: FieldFilter) {
		filters = [...filters, filter];
		text = '';
		announcement = `Added filter ${filter.tag}: ${filter.value}`;
	}

	function removeFilter(index: number) {
		const removed = filters[index];
		filters = filters.filter((_, i) => i !== index);
		announcement = `Removed filter ${removed.tag}: ${removed.value}`;
		input?.focus();
	}

	function pick(option: Option) {
		if (option.kind === 'field') text = `${option.field.tag}:`;
		else addFilter({ tag: option.tag, value: option.value, exact: true });
		dismissed = false;
		input?.focus();
	}

	function moveActive(delta: 1 | -1) {
		dismissed = false;
		if (activeIndex === -1) activeIndex = delta === 1 ? 0 : options.length - 1;
		else activeIndex = (activeIndex + delta + options.length) % options.length;
		requestAnimationFrame(() =>
			listEl?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
		);
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				if (options.length === 0) return;
				event.preventDefault();
				moveActive(event.key === 'ArrowDown' ? 1 : -1);
				break;
			case 'Enter': {
				const option = panelOpen ? options[activeIndex] : undefined;
				if (option) {
					event.preventDefault();
					pick(option);
				} else if (typing?.query.trim()) {
					event.preventDefault();
					addFilter({ tag: typing.field.tag, value: typing.query.trim() });
				}
				break;
			}
			case 'Tab': {
				// Completes what's typed with the highlighted suggestion, or the first one. With
				// nothing typed (a bare `tag:` included), Tab moves focus as usual.
				const option = options[Math.max(activeIndex, 0)];
				const typed = typing ? typing.query.trim() : text.trim();
				if (panelOpen && option && !event.shiftKey && (activeIndex >= 0 || typed)) {
					event.preventDefault();
					pick(option);
				}
				break;
			}
			case 'Escape':
				event.preventDefault();
				if (panelOpen) {
					dismissed = true;
				} else if (text && filters.length > 0) {
					// Typed text goes first, so one Escape doesn't also throw away the chips.
					text = '';
				} else {
					text = '';
					filters = [];
					expanded = false;
					input?.blur();
				}
				break;
			case 'Backspace':
				if (text === '' && filters.length > 0) {
					event.preventDefault();
					removeFilter(filters.length - 1);
				}
				break;
		}
	}

	function handleBlur() {
		focused = false;
		if (!text && filters.length === 0) expanded = false;
	}
</script>

{#if expanded}
	<div class="relative w-full min-w-0 sm:w-80 sm:flex-none">
		<!-- A click anywhere in the box, between chips included, lands in the text field. -->
		<div
			class="field-input search-box flex h-auto min-h-[2.375rem] flex-wrap items-center gap-1 py-1"
			role="presentation"
			onclick={() => input?.focus()}
		>
			{#each filters as filter, index (`${index}:${filter.tag}:${filter.value}`)}
				<span class="search-chip">
					<span class="font-mono">{filter.tag}:</span>
					<span class="search-chip-value">{filter.value}</span>
					<button
						type="button"
						class="search-chip-remove"
						aria-label="Remove filter {filter.tag}: {filter.value}"
						onclick={(event) => {
							event.stopPropagation();
							removeFilter(index);
						}}
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}
			<input
				name="filter"
				bind:this={input}
				type="search"
				class="search-box-input"
				placeholder={filters.length > 0 ? '' : 'Filter…'}
				aria-label="Filter"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={panelOpen}
				aria-controls={listboxId}
				aria-activedescendant={panelOpen ? options[activeIndex]?.id : undefined}
				autocomplete="off"
				bind:value={text}
				onfocus={() => (focused = true)}
				onblur={handleBlur}
				oninput={() => (dismissed = false)}
				onkeydown={handleKeydown}
			/>
		</div>
		{#if panelOpen}
			<div
				bind:this={listEl}
				id={listboxId}
				role="listbox"
				aria-label={typing ? `${typing.field.tag} values` : 'Filter by'}
				class="search-panel absolute right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded border"
			>
				{#each options as option, index (option.id)}
					<button
						id={option.id}
						type="button"
						role="option"
						tabindex="-1"
						aria-selected={index === activeIndex}
						class="kc-picker-row flex w-full items-baseline gap-2 border-b p-2 text-left last:border-b-0"
						class:kc-picker-row-active={index === activeIndex}
						style="border-color: var(--border)"
						onmousedown={(event) => event.preventDefault()}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => pick(option)}
					>
						{#if option.kind === 'field'}
							<span class="font-mono text-sm">{option.field.tag}:</span>
							<span class="text-muted truncate text-xs">{option.field.description}</span>
						{:else}
							<span class="truncate text-sm">{option.value}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
		<p class="sr-only" aria-live="polite">{announcement}</p>
	</div>
{:else}
	<button type="button" class="btn-icon shrink-0" aria-label="Filter" onclick={expand}>
		<Search class="mx-auto h-5 w-5" />
	</button>
{/if}

<script lang="ts">
	import { untrack } from 'svelte';
	import type { KeycapSet, KeycapSetInput } from '@roguekeyboards/mykeebs-api-client';
	import { Visibility } from '@roguekeyboards/mykeebs-api-client';
	import VisibilityPicker from './VisibilityPicker.svelte';
	import { lookupsApi } from '#lib/api/client.js';

	let {
		initial,
		saving,
		error,
		onSubmit,
		onCancel
	}: {
		initial?: KeycapSet;
		saving: boolean;
		error: string | null;
		onSubmit: (input: KeycapSetInput) => void;
		onCancel: () => void;
	} = $props();

	// Read once: a form keeps its in-progress edits when `initial` refreshes.
	const seed = untrack(() => initial);

	let brand = $state(seed?.brand ?? '');
	let name = $state(seed?.name ?? '');
	let profile = $state(seed?.profile ?? '');
	let material = $state(seed?.material ?? '');
	let notes = $state(seed?.notes ?? '');
	let visibility = $state<Visibility>(seed?.visibility ?? Visibility.Private);

	let profiles = $state<string[]>([]);
	let materials = $state<string[]>([]);

	function optionsWith(loaded: string[], current: string): string[] {
		return current && !loaded.includes(current) ? [current, ...loaded] : loaded;
	}

	$effect(() => {
		Promise.all([
			lookupsApi.getLookup({ category: 'keycap_profile' }),
			lookupsApi.getLookup({ category: 'keycap_material' })
		])
			.then(([profileLookup, materialLookup]) => {
				profiles = profileLookup.values;
				materials = materialLookup.values;
			})
			// Lookups only populate suggestions; the fields work without them.
			.catch(() => {});
	});

	const initialBrand = seed?.brand ?? '';
	const initialName = seed?.name ?? '';
	const initialProfile = seed?.profile ?? '';
	const initialMaterial = seed?.material ?? '';
	const initialNotes = seed?.notes ?? '';
	const initialVisibility = seed?.visibility ?? Visibility.Private;

	export function isDirty(): boolean {
		return (
			brand !== initialBrand ||
			name !== initialName ||
			profile !== initialProfile ||
			material !== initialMaterial ||
			notes !== initialNotes ||
			visibility !== initialVisibility
		);
	}

	let validationError = $state<string | null>(null);
	const uid = $props.id();
	const validationId = `validation-${uid}`;

	function guardEnterSubmit(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		const target = event.target as HTMLElement;
		if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
		event.preventDefault();
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		validationError = null;

		if (!brand.trim() || !name.trim()) {
			validationError = 'Brand and name are required.';
			return;
		}

		const input: KeycapSetInput = {
			brand: brand.trim(),
			name: name.trim(),
			profile: profile.trim() || undefined,
			material: material.trim() || undefined,
			notes: notes.trim() || undefined,
			visibility
		};

		onSubmit(input);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="flex flex-col gap-5" onsubmit={handleSubmit} onkeydown={guardEnterSubmit}>
	<h2 class="heading-lg text-2xl">{initial ? 'Edit keycap set' : 'Add keycap set'}</h2>

	<fieldset class="flex flex-col items-start gap-1.5">
		<legend class="field-label mb-1.5">Visibility</legend>
		<VisibilityPicker bind:value={visibility} />
	</fieldset>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="flex flex-col gap-1.5">
			<span class="field-label"
				>Brand <span aria-hidden="true" style="color: var(--danger)">*</span></span
			>
			<input
				name="brand"
				type="text"
				class="field-input"
				bind:value={brand}
				aria-required="true"
				aria-invalid={validationError !== null && !brand.trim()}
				aria-describedby={validationError !== null && !brand.trim() ? validationId : undefined}
				autocomplete="off"
				data-autofocus
			/>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label"
				>Name <span aria-hidden="true" style="color: var(--danger)">*</span></span
			>
			<input
				name="name"
				type="text"
				class="field-input"
				bind:value={name}
				aria-required="true"
				aria-invalid={validationError !== null && !name.trim()}
				aria-describedby={validationError !== null && !name.trim() ? validationId : undefined}
				autocomplete="off"
			/>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label">Profile</span>
			<select name="profile" class="field-select w-full" bind:value={profile}>
				<option value="">—</option>
				{#each optionsWith(profiles, profile) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label">Material</span>
			<select name="material" class="field-select w-full" bind:value={material}>
				<option value="">—</option>
				{#each optionsWith(materials, material) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>
	</div>

	<label class="flex flex-col gap-1.5">
		<span class="field-label">Notes</span>
		<textarea name="notes" class="field-input" rows="5" maxlength="1000" bind:value={notes}
		></textarea>
	</label>

	{#if validationError}
		<p id={validationId} class="text-sm" role="alert" style="color: var(--danger)">
			{validationError}
		</p>
	{/if}
	{#if error}
		<p class="text-sm" role="alert" style="color: var(--danger)">{error}</p>
	{/if}

	<div class="mt-2 flex gap-2">
		<button type="submit" class="btn btn-accent" disabled={saving}>
			{saving ? 'Saving…' : initial ? 'Save changes' : 'Add keycap set'}
		</button>
		<button type="button" class="btn" disabled={saving} onclick={onCancel}>Cancel</button>
	</div>
</form>

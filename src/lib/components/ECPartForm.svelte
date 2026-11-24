<script lang="ts">
	import { isPending } from '#lib/image-moderation.js';
	import { pickedUploadMessage, uploadEach } from '#lib/upload.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';
	import BulkPurchaseFields from '#lib/components/BulkPurchaseFields.svelte';
	import { untrack } from 'svelte';
	import type { ECPart, ECPartInput, ECPartType } from '@roguekeyboards/mykeebs-api-client';
	import { ECPartSize, ECSliderStem, Visibility } from '@roguekeyboards/mykeebs-api-client';
	import VisibilityPicker from './VisibilityPicker.svelte';
	import { lookupsApi } from '#lib/api/client.js';
	import { EC_PART_TYPES, ecPartTypeLabel } from '#lib/ec-parts.js';
	import { bulkPurchaseDrafts, bulkPurchaseInputs, bulkPurchasesSummary } from '#lib/purchases.js';

	let {
		initial,
		saving,
		error,
		onSubmit,
		onCancel,
		onImageUpload,
		onImageRemove
	}: {
		initial?: ECPart;
		saving: boolean;
		error: string | null;
		onSubmit: (input: ECPartInput, stagedImage?: File) => void;
		onCancel: () => void;
		onImageUpload?: (file: File) => Promise<void>;
		onImageRemove?: () => Promise<void>;
	} = $props();

	// Read once: a form keeps its in-progress edits when `initial` refreshes.
	const seed = untrack(() => initial);

	const uid = $props.id();

	function snapshot(part?: ECPart) {
		return {
			brand: part?.brand ?? '',
			name: part?.name ?? '',
			partType: (part?.partType ?? '') as ECPartType | '',
			domeWeight: part?.domes?.weight,
			domeMaterial: part?.domes?.material ?? '',
			domeColor: part?.domes?.color ?? '',
			sliderSize: part?.sliders?.size ?? '',
			sliderStem: part?.sliders?.stem ?? '',
			sliderMaterial: part?.sliders?.material ?? '',
			housingSize: part?.housings?.size ?? '',
			housingMaterial: part?.housings?.material ?? '',
			springMaterial: part?.springs?.material ?? '',
			ringMaterial: part?.rings?.material ?? '',
			ringThickness: part?.rings?.thickness,
			notes: part?.notes ?? '',
			visibility: part?.visibility ?? Visibility.Private
		};
	}

	const initialValues = snapshot(seed);
	let values = $state(snapshot(seed));
	let purchases = $state(bulkPurchaseDrafts(seed?.purchases));
	const initialPurchases = JSON.stringify(bulkPurchaseInputs(bulkPurchaseDrafts(seed?.purchases)));

	let purchaseOpen = $state(Boolean(seed?.purchases?.length));
	let purchaseHint = $derived(bulkPurchasesSummary(purchases) ?? 'Not set');

	let domeMaterials = $state<string[]>([]);
	let switchMaterials = $state<string[]>([]);
	let springMaterials = $state<string[]>([]);
	let ringMaterials = $state<string[]>([]);
	let vendors = $state<string[]>([]);
	let orderStatuses = $state<string[]>([]);

	function optionsWith(loaded: string[], current: string): string[] {
		return current && !loaded.includes(current) ? [current, ...loaded] : loaded;
	}

	$effect(() => {
		Promise.all([
			lookupsApi.getLookup({ category: 'ec_dome_material' }),
			lookupsApi.getLookup({ category: 'switch_material' }),
			lookupsApi.getLookup({ category: 'switch_spring_material' }),
			lookupsApi.getLookup({ category: 'ec_ring_material' }),
			lookupsApi.getLookup({ category: 'vendor' }),
			lookupsApi.getLookup({ category: 'order_status' })
		])
			.then(([dome, material, spring, ring, vendor, status]) => {
				domeMaterials = dome.values;
				switchMaterials = material.values;
				springMaterials = spring.values;
				ringMaterials = ring.values;
				vendors = vendor.values;
				orderStatuses = status.values;
			})
			// Lookups only populate suggestions; the fields work without them.
			.catch(() => {});
	});

	let imageBusy = $state(false);
	let imageError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	let stagedImage = $state<File | null>(null);
	let stagedImagePreview = $state<string | null>(null);

	$effect(() => {
		return () => {
			if (stagedImagePreview) URL.revokeObjectURL(stagedImagePreview);
		};
	});

	function onImagePick(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		if (!initial) {
			if (stagedImagePreview) URL.revokeObjectURL(stagedImagePreview);
			stagedImage = file;
			stagedImagePreview = URL.createObjectURL(file);
			if (fileInput) fileInput.value = '';
			return;
		}

		uploadImage(file);
	}

	async function uploadImage(file: File) {
		if (!onImageUpload) return;
		imageError = null;
		imageBusy = true;
		try {
			const failure = await uploadEach([file], onImageUpload);
			if (failure) imageError = pickedUploadMessage(failure);
		} finally {
			imageBusy = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function clearStagedImage() {
		if (stagedImagePreview) URL.revokeObjectURL(stagedImagePreview);
		stagedImage = null;
		stagedImagePreview = null;
	}

	async function removeImage() {
		if (!onImageRemove) return;
		imageError = null;
		imageBusy = true;
		try {
			await onImageRemove();
		} catch {
			imageError = 'Could not remove the image.';
		} finally {
			imageBusy = false;
		}
	}

	// `!=` rather than `!==` so a cleared number input (null) matches undefined.
	export function isDirty(): boolean {
		return (
			(Object.keys(values) as (keyof typeof values)[]).some(
				(key) => values[key] != initialValues[key]
			) ||
			JSON.stringify(bulkPurchaseInputs(purchases)) !== initialPurchases ||
			stagedImage != null
		);
	}

	let validationError = $state<string | null>(null);
	const validationId = `validation-${uid}`;

	function guardEnterSubmit(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		const target = event.target as HTMLElement;
		if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
		event.preventDefault();
	}

	const text = (value: string) => value.trim() || undefined;

	function subObject(): Partial<ECPartInput> {
		const v = values;
		switch (v.partType) {
			case 'domes':
				return {
					domes: {
						weight: v.domeWeight ?? undefined,
						material: text(v.domeMaterial),
						color: text(v.domeColor)
					}
				};
			case 'sliders':
				return {
					sliders: {
						size: (v.sliderSize || undefined) as ECPartSize | undefined,
						stem: (v.sliderStem || undefined) as ECSliderStem | undefined,
						material: text(v.sliderMaterial)
					}
				};
			case 'housings':
				return {
					housings: {
						size: (v.housingSize || undefined) as ECPartSize | undefined,
						material: text(v.housingMaterial)
					}
				};
			case 'springs':
				return { springs: { material: text(v.springMaterial) } };
			case 'rings':
				return {
					rings: { material: text(v.ringMaterial), thickness: v.ringThickness ?? undefined }
				};
			default:
				return {};
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		validationError = null;

		const partType = values.partType;
		if (!values.brand.trim() || !values.name.trim() || !partType) {
			validationError = 'Brand, name, and part type are required.';
			return;
		}

		const input: ECPartInput = {
			brand: values.brand.trim(),
			name: values.name.trim(),
			partType,
			...subObject(),
			purchases: bulkPurchaseInputs(purchases),
			notes: text(values.notes),
			visibility: values.visibility
		};

		onSubmit(input, stagedImage ?? undefined);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="flex flex-col gap-5" onsubmit={handleSubmit} onkeydown={guardEnterSubmit}>
	<h2 class="heading-lg text-2xl">{initial ? 'Edit EC part' : 'Add EC part'}</h2>

	<div class="flex items-center gap-4">
		{#if initial?.image?.url}
			<div class="relative shrink-0">
				<img
					src={initial.image.url}
					alt={initial.name}
					class="kc-thumb h-20 w-20 object-contain"
					decoding="async"
				/>
				{#if isPending(initial.image)}
					<PendingReviewBadge />
				{/if}
			</div>
		{:else if initial?.image}
			<RejectedImage reason={initial.image.rejectionReason} class="h-20 w-20 shrink-0" />
		{:else if stagedImagePreview}
			<img
				src={stagedImagePreview}
				alt="Selected EC part"
				class="kc-thumb h-20 w-20 shrink-0 object-contain"
				decoding="async"
			/>
		{/if}
		<div class="flex flex-col gap-2">
			<div class="flex gap-2">
				<button type="button" class="btn" disabled={imageBusy} onclick={() => fileInput?.click()}>
					{imageBusy ? 'Working…' : initial?.image || stagedImage ? 'Change photo' : 'Add photo'}
				</button>
				{#if initial?.image}
					<button type="button" class="btn" disabled={imageBusy} onclick={removeImage}>
						Remove
					</button>
				{:else if stagedImage}
					<button type="button" class="btn" onclick={clearStagedImage}> Remove </button>
				{/if}
			</div>
			{#if imageError}
				<span class="text-xs" role="alert" style="color: var(--danger)">{imageError}</span>
			{/if}
		</div>
		<input
			name="images"
			bind:this={fileInput}
			type="file"
			accept="image/*"
			class="hidden"
			onchange={onImagePick}
		/>
	</div>

	<fieldset class="flex flex-col items-start gap-1.5">
		<legend class="field-label mb-1.5">Visibility</legend>
		<VisibilityPicker bind:value={values.visibility} />
	</fieldset>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="flex flex-col gap-1.5">
			<span class="field-label">
				Brand <span aria-hidden="true" style="color: var(--danger)">*</span>
			</span>
			<input
				name="brand"
				type="text"
				class="field-input"
				bind:value={values.brand}
				aria-required="true"
				aria-invalid={validationError !== null && !values.brand.trim()}
				aria-describedby={validationError !== null && !values.brand.trim()
					? validationId
					: undefined}
				autocomplete="off"
				data-autofocus
			/>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label">
				Name <span aria-hidden="true" style="color: var(--danger)">*</span>
			</span>
			<input
				name="name"
				type="text"
				class="field-input"
				bind:value={values.name}
				aria-required="true"
				aria-invalid={validationError !== null && !values.name.trim()}
				aria-describedby={validationError !== null && !values.name.trim()
					? validationId
					: undefined}
				autocomplete="off"
			/>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label">
				Part type <span aria-hidden="true" style="color: var(--danger)">*</span>
			</span>
			<select
				name="partType"
				class="field-select w-full"
				bind:value={values.partType}
				aria-required="true"
				aria-invalid={validationError !== null && !values.partType}
				aria-describedby={validationError !== null && !values.partType ? validationId : undefined}
			>
				<option value="" disabled>Select a part type…</option>
				{#each EC_PART_TYPES as value (value)}
					<option {value}>{ecPartTypeLabel(value)}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if values.partType === 'domes'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Weight (g)</span>
				<input
					name="domeWeight"
					type="number"
					class="field-input"
					min="0"
					step="0.1"
					bind:value={values.domeWeight}
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Material</span>
				<select name="domeMaterial" class="field-select w-full" bind:value={values.domeMaterial}>
					<option value="">—</option>
					{#each optionsWith(domeMaterials, values.domeMaterial) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Color</span>
				<input
					name="domeColor"
					type="text"
					class="field-input"
					bind:value={values.domeColor}
					autocomplete="off"
				/>
			</label>
		</div>
	{:else if values.partType === 'sliders'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{@render sizeSelect('sliderSize')}
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Stem</span>
				<select name="sliderStem" class="field-select w-full" bind:value={values.sliderStem}>
					<option value="">—</option>
					{#each Object.values(ECSliderStem) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			{@render materialSelect('sliderMaterial', switchMaterials)}
		</div>
	{:else if values.partType === 'housings'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{@render sizeSelect('housingSize')}
			{@render materialSelect('housingMaterial', switchMaterials)}
		</div>
	{:else if values.partType === 'springs'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{@render materialSelect('springMaterial', springMaterials)}
		</div>
	{:else if values.partType === 'rings'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{@render materialSelect('ringMaterial', ringMaterials)}
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Thickness (mm)</span>
				<input
					name="ringThickness"
					type="number"
					class="field-input"
					min="0"
					step="0.01"
					bind:value={values.ringThickness}
				/>
			</label>
		</div>
	{/if}

	{#snippet sizeSelect(field: 'sliderSize' | 'housingSize')}
		<label class="flex flex-col gap-1.5">
			<span class="field-label">Size</span>
			<select name={field} class="field-select w-full" bind:value={values[field]}>
				<option value="">—</option>
				{#each Object.values(ECPartSize) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>
	{/snippet}

	{#snippet materialSelect(
		field: 'sliderMaterial' | 'housingMaterial' | 'springMaterial' | 'ringMaterial',
		options: string[]
	)}
		<label class="flex flex-col gap-1.5">
			<span class="field-label">Material</span>
			<select name={field} class="field-select w-full" bind:value={values[field]}>
				<option value="">—</option>
				{#each optionsWith(options, values[field]) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>
	{/snippet}

	<details class="field-group" bind:open={purchaseOpen}>
		<summary>
			Purchase
			<span class="field-group-hint">— {purchaseHint}</span>
		</summary>
		<div class="field-group-body">
			<BulkPurchaseFields
				bind:purchases
				{vendors}
				{orderStatuses}
				priceHint="The total paid for all of them."
			/>
		</div>
	</details>

	<label class="flex flex-col gap-1.5">
		<span class="field-label">Notes</span>
		<textarea name="notes" class="field-input" rows="5" maxlength="1000" bind:value={values.notes}
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
		<button type="submit" class="btn btn-accent" disabled={saving || imageBusy}>
			{saving ? 'Saving…' : initial ? 'Save changes' : 'Add EC part'}
		</button>
		<button type="button" class="btn" disabled={saving} onclick={onCancel}>Cancel</button>
	</div>
</form>

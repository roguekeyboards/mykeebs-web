<script lang="ts">
	import { isPending, uploadErrorMessage } from '#lib/image-moderation.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';
	import { untrack } from 'svelte';
	import type { Keyboard, KeyboardInput } from '@rogueserenity/kbdb-api-client';
	import { Visibility } from '@rogueserenity/kbdb-api-client';
	import VisibilityPicker from './VisibilityPicker.svelte';
	import PurchaseFields from './PurchaseFields.svelte';
	import { lookupsApi } from '#lib/api/client.js';
	import { X } from '@lucide/svelte';
	import {
		pcbDraft,
		pcbInput,
		pcbLabel,
		plateDraft,
		plateInput,
		purchaseDraft,
		purchaseInput,
		purchaseSummary,
		type KeyboardParts
	} from '#lib/keyboard-parts.js';
	import { limitNotice, MAX_IMAGES, takeWithinLimit } from '#lib/image-limit.js';

	let {
		initial,
		saving,
		error,
		onSubmit,
		onCancel,
		onImageUpload,
		onImageRemove
	}: {
		initial?: Keyboard;
		saving: boolean;
		error: string | null;
		onSubmit: (
			input: KeyboardInput,
			stagedImages: File[] | undefined,
			parts: KeyboardParts
		) => void;
		onCancel: () => void;
		onImageUpload?: (file: File) => Promise<void>;
		onImageRemove?: (imageId: string) => Promise<void>;
	} = $props();

	// Read once: a form keeps its in-progress edits when `initial` refreshes.
	const seed = untrack(() => initial);

	let brand = $state(seed?.brand ?? '');
	let name = $state(seed?.name ?? '');
	let size = $state(seed?.size ?? '');
	let layout = $state(seed?.layout ?? '');
	let topCaseMaterial = $state(seed?.design?.topCase?.material ?? '');
	let topCaseColor = $state(seed?.design?.topCase?.color ?? '');
	let bottomCaseMaterial = $state(seed?.design?.bottomCase?.material ?? '');
	let bottomCaseColor = $state(seed?.design?.bottomCase?.color ?? '');
	let weightMaterial = $state(seed?.design?.weight?.material ?? '');
	let weightColor = $state(seed?.design?.weight?.color ?? '');
	let plates = $state((seed?.plates ?? []).map(plateDraft));
	let pcbs = $state((seed?.pcbs ?? []).map(pcbDraft));
	let purchase = $state(purchaseDraft(seed?.purchase));
	let notes = $state(seed?.notes ?? '');
	let visibility = $state<Visibility>(seed?.visibility ?? Visibility.Private);

	let designOpen = $state(Boolean(seed?.design));
	let platesOpen = $state(plates.length > 0);
	let pcbsOpen = $state(pcbs.length > 0);
	let purchaseOpen = $state(Boolean(seed?.purchase));

	let designSummary = $derived(
		[
			topCaseColor.trim() || topCaseMaterial.trim() ? 'top case' : undefined,
			bottomCaseColor.trim() || bottomCaseMaterial.trim() ? 'bottom case' : undefined,
			weightColor.trim() || weightMaterial.trim() ? 'weight' : undefined
		]
			.filter(Boolean)
			.join(' · ') || 'Not set'
	);
	let platesSummary = $derived(
		plates.map((p) => p.material.trim() || 'New plate').join(' · ') || 'None'
	);
	let pcbsSummary = $derived(pcbs.map((p) => pcbLabel(p)).join(' · ') || 'None');
	let keyboardPurchaseSummary = $derived(purchaseSummary(purchase) ?? 'Not set');

	type LayoutValue = { name: string; sizes: string[] };

	let keyboardSizes = $state<string[]>([]);
	let allLayouts = $state<LayoutValue[]>([]);
	let caseMaterials = $state<string[]>([]);
	let weightMaterials = $state<string[]>([]);
	let plateMaterials = $state<string[]>([]);
	let firmwares = $state<string[]>([]);
	let assemblies = $state<string[]>([]);
	let connectivities = $state<string[]>([]);
	let vendors = $state<string[]>([]);
	let orderStatuses = $state<string[]>([]);

	let availableLayouts = $derived(
		size
			? allLayouts.filter((l) => l.sizes.includes(size)).map((l) => l.name)
			: allLayouts.map((l) => l.name)
	);

	$effect(() => {
		if (allLayouts.length === 0) return;
		if (size && layout && !availableLayouts.includes(layout)) layout = '';
	});

	function optionsWith(loaded: string[], current: string): string[] {
		return current && !loaded.includes(current) ? [current, ...loaded] : loaded;
	}

	$effect(() => {
		Promise.all([
			lookupsApi.getLookup({ category: 'keyboard_size' }),
			lookupsApi.getLookup({ category: 'keyboard_layout' }),
			lookupsApi.getLookup({ category: 'keyboard_case_material' }),
			lookupsApi.getLookup({ category: 'keyboard_weight_material' }),
			lookupsApi.getLookup({ category: 'keyboard_plate_material' }),
			lookupsApi.getLookup({ category: 'keyboard_pcb_firmware' }),
			lookupsApi.getLookup({ category: 'keyboard_pcb_assembly_type' }),
			lookupsApi.getLookup({ category: 'keyboard_pcb_connectivity_type' }),
			lookupsApi.getLookup({ category: 'vendor' }),
			lookupsApi.getLookup({ category: 'order_status' })
		])
			.then(
				([
					sizeLookup,
					layoutLookup,
					caseMaterial,
					weightMaterialLookup,
					plateMaterial,
					firmwareLookup,
					assemblyLookup,
					connectivityLookup,
					vendorLookup,
					statusLookup
				]) => {
					keyboardSizes = sizeLookup.values;
					allLayouts = layoutLookup.values as LayoutValue[];
					caseMaterials = caseMaterial.values;
					weightMaterials = weightMaterialLookup.values;
					plateMaterials = plateMaterial.values;
					firmwares = firmwareLookup.values;
					assemblies = assemblyLookup.values;
					connectivities = connectivityLookup.values;
					vendors = vendorLookup.values;
					orderStatuses = statusLookup.values;
				}
			)
			// Lookups only populate suggestions; the fields work without them.
			.catch(() => {});
	});

	let imageBusy = $state(false);
	let imageError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	type StagedImage = { file: File; preview: string };
	let stagedImages = $state<StagedImage[]>([]);
	const imageCount = $derived(initial ? (initial.images?.length ?? 0) : stagedImages.length);
	const atImageLimit = $derived(imageCount >= MAX_IMAGES);

	$effect(() => {
		return () => {
			for (const staged of stagedImages) URL.revokeObjectURL(staged.preview);
		};
	});

	function onImagePick(event: Event) {
		const picked = Array.from((event.target as HTMLInputElement).files ?? []);
		if (picked.length === 0) return;
		const { accepted: files, skipped } = takeWithinLimit(picked, imageCount);
		const notice = skipped > 0 ? limitNotice(skipped) : null;

		if (!initial) {
			stagedImages = [
				...stagedImages,
				...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))
			];
			imageError = notice;
			if (fileInput) fileInput.value = '';
			return;
		}

		uploadImages(files, notice);
	}

	async function uploadImages(files: File[], notice: string | null) {
		if (!onImageUpload) return;
		imageError = null;
		imageBusy = true;
		try {
			for (const file of files) await onImageUpload(file);
			imageError = notice;
		} catch (err) {
			imageError = uploadErrorMessage(err);
		} finally {
			imageBusy = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function removeStagedImage(index: number) {
		const [removed] = stagedImages.splice(index, 1);
		stagedImages = [...stagedImages];
		if (removed) URL.revokeObjectURL(removed.preview);
	}

	async function removeImage(imageId: string) {
		if (!onImageRemove) return;
		imageError = null;
		imageBusy = true;
		try {
			await onImageRemove(imageId);
		} catch {
			imageError = 'Could not remove the image.';
		} finally {
			imageBusy = false;
		}
	}

	const initialBrand = seed?.brand ?? '';
	const initialName = seed?.name ?? '';
	const initialSize = seed?.size ?? '';
	const initialLayout = seed?.layout ?? '';
	const initialTopCaseMaterial = seed?.design?.topCase?.material ?? '';
	const initialTopCaseColor = seed?.design?.topCase?.color ?? '';
	const initialBottomCaseMaterial = seed?.design?.bottomCase?.material ?? '';
	const initialBottomCaseColor = seed?.design?.bottomCase?.color ?? '';
	const initialWeightMaterial = seed?.design?.weight?.material ?? '';
	const initialWeightColor = seed?.design?.weight?.color ?? '';
	const partsSnapshot = () =>
		JSON.stringify([
			plates.map((p) => [p.id, plateInput(p)]),
			pcbs.map((p) => [p.id, pcbInput(p)]),
			purchaseInput(purchase)
		]);
	const initialParts = partsSnapshot();
	const initialNotes = seed?.notes ?? '';
	const initialVisibility = seed?.visibility ?? Visibility.Private;

	export function isDirty(): boolean {
		return (
			brand !== initialBrand ||
			name !== initialName ||
			size !== initialSize ||
			layout !== initialLayout ||
			topCaseMaterial !== initialTopCaseMaterial ||
			topCaseColor !== initialTopCaseColor ||
			bottomCaseMaterial !== initialBottomCaseMaterial ||
			bottomCaseColor !== initialBottomCaseColor ||
			weightMaterial !== initialWeightMaterial ||
			weightColor !== initialWeightColor ||
			partsSnapshot() !== initialParts ||
			notes !== initialNotes ||
			visibility !== initialVisibility ||
			stagedImages.length > 0
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

		const hasTopCase = topCaseMaterial.trim() || topCaseColor.trim();
		const hasBottomCase = bottomCaseMaterial.trim() || bottomCaseColor.trim();
		const hasWeight = weightMaterial.trim() || weightColor.trim();
		const hasDesign = hasTopCase || hasBottomCase || hasWeight;

		if (plates.some((p) => !p.material.trim())) {
			validationError = 'Every plate needs a material.';
			platesOpen = true;
			return;
		}

		if (pcbs.some((p) => !p.assembly.trim() || !p.connectivity.trim())) {
			validationError = 'Every PCB needs an assembly and connectivity.';
			pcbsOpen = true;
			return;
		}

		const input: KeyboardInput = {
			brand: brand.trim(),
			name: name.trim(),
			size: size.trim() || undefined,
			layout: layout.trim() || undefined,
			design: hasDesign
				? {
						topCase: hasTopCase
							? {
									material: topCaseMaterial.trim() || undefined,
									color: topCaseColor.trim() || undefined
								}
							: undefined,
						bottomCase: hasBottomCase
							? {
									material: bottomCaseMaterial.trim() || undefined,
									color: bottomCaseColor.trim() || undefined
								}
							: undefined,
						weight: hasWeight
							? {
									material: weightMaterial.trim() || undefined,
									color: weightColor.trim() || undefined
								}
							: undefined
					}
				: undefined,
			purchase: purchaseInput(purchase),
			notes: notes.trim() || undefined,
			visibility
		};

		onSubmit(
			input,
			stagedImages.length > 0 ? stagedImages.map((staged) => staged.file) : undefined,
			{ plates, pcbs }
		);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="flex flex-col gap-5" onsubmit={handleSubmit} onkeydown={guardEnterSubmit}>
	<h2 class="heading-lg text-2xl">{initial ? 'Edit keyboard' : 'Add keyboard'}</h2>

	<div class="flex flex-col gap-2">
		<span class="field-label">Images</span>
		<div class="flex flex-wrap gap-3">
			{#if initial}
				{#each initial.images ?? [] as image, index (image.imageId)}
					<div class="relative">
						{#if image.url === undefined}
							<RejectedImage reason={image.rejectionReason} class="h-20 w-20" />
						{:else}
							<img
								src={image.url}
								alt={initial.name}
								class="kc-thumb h-20 w-20 object-contain"
								loading="lazy"
								decoding="async"
							/>
							{#if isPending(image)}
								<PendingReviewBadge />
							{/if}
						{/if}
						<button
							type="button"
							class="btn-icon absolute -top-2 -right-2 h-6 w-6 text-xs"
							disabled={imageBusy}
							aria-label="Remove image {index + 1} of {initial.images?.length}"
							onclick={() => removeImage(image.imageId)}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}
			{:else}
				{#each stagedImages as staged, index (staged.preview)}
					<div class="relative">
						<img
							src={staged.preview}
							alt="Selected keyboard"
							class="kc-thumb h-20 w-20 object-contain"
							decoding="async"
						/>
						<button
							type="button"
							class="btn-icon absolute -top-2 -right-2 h-6 w-6 text-xs"
							aria-label="Remove image {index + 1} of {stagedImages.length}"
							onclick={() => removeStagedImage(index)}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}
			{/if}
			<button
				type="button"
				class="btn"
				disabled={imageBusy || atImageLimit}
				onclick={() => fileInput?.click()}
			>
				{imageBusy ? 'Working…' : '+ Add photo'}
			</button>
		</div>
		{#if atImageLimit}
			<span class="text-faint text-xs">Up to {MAX_IMAGES} photos. Remove one to add another.</span>
		{/if}
		{#if imageError}
			<span class="text-xs" role="alert" style="color: var(--danger)">{imageError}</span>
		{/if}
		<input
			name="images"
			bind:this={fileInput}
			type="file"
			accept="image/*"
			multiple
			class="hidden"
			onchange={onImagePick}
		/>
	</div>

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
			<span class="field-label">Size</span>
			<select name="size" class="field-select w-full" bind:value={size}>
				<option value="">—</option>
				{#each optionsWith(keyboardSizes, size) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label">Layout</span>
			<select name="layout" class="field-select w-full" bind:value={layout}>
				<option value="">—</option>
				{#each optionsWith(availableLayouts, layout) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>
	</div>

	<details class="field-group" bind:open={designOpen}>
		<summary>
			Design
			<span class="field-group-hint">— {designSummary}</span>
		</summary>
		<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-3">
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Top case material</span>
				<select name="topCaseMaterial" class="field-select w-full" bind:value={topCaseMaterial}>
					<option value="">—</option>
					{#each optionsWith(caseMaterials, topCaseMaterial) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Top case color</span>
				<input
					name="topCaseColor"
					type="text"
					class="field-input"
					bind:value={topCaseColor}
					autocomplete="off"
				/>
			</label>
			<div class="hidden sm:block"></div>

			<label class="flex flex-col gap-1.5">
				<span class="field-label">Bottom case material</span>
				<select
					name="bottomCaseMaterial"
					class="field-select w-full"
					bind:value={bottomCaseMaterial}
				>
					<option value="">—</option>
					{#each optionsWith(caseMaterials, bottomCaseMaterial) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Bottom case color</span>
				<input
					name="bottomCaseColor"
					type="text"
					class="field-input"
					bind:value={bottomCaseColor}
					autocomplete="off"
				/>
			</label>
			<div class="hidden sm:block"></div>

			<label class="flex flex-col gap-1.5">
				<span class="field-label">Weight material</span>
				<select name="weightMaterial" class="field-select w-full" bind:value={weightMaterial}>
					<option value="">—</option>
					{#each optionsWith(weightMaterials, weightMaterial) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Weight color</span>
				<input
					name="weightColor"
					type="text"
					class="field-input"
					bind:value={weightColor}
					autocomplete="off"
				/>
			</label>
			<div class="hidden sm:block"></div>
		</div>
	</details>

	<details class="field-group" bind:open={platesOpen}>
		<summary>
			Plates
			<span class="field-group-hint">— {platesSummary}</span>
		</summary>
		<div class="field-group-body flex flex-col gap-4">
			{#each plates as plate, index (plate.key)}
				<fieldset
					class="relative flex flex-col gap-4 rounded-lg border p-4"
					style="border-color: var(--border)"
				>
					<legend class="field-label px-1">Plate {index + 1}</legend>
					<button
						type="button"
						class="btn-icon absolute top-2 right-2 h-7 w-7"
						aria-label="Remove plate {index + 1}"
						onclick={() => plates.splice(index, 1)}
					>
						<X class="h-4 w-4" />
					</button>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<label class="flex flex-col gap-1.5">
							<span class="field-label"
								>Material <span aria-hidden="true" style="color: var(--danger)">*</span></span
							>
							<select
								name="plates[{index}].material"
								class="field-select w-full"
								aria-required="true"
								aria-invalid={validationError !== null && !plate.material.trim()}
								aria-describedby={validationError !== null && !plate.material.trim()
									? validationId
									: undefined}
								bind:value={plate.material}
							>
								<option value="">—</option>
								{#each optionsWith(plateMaterials, plate.material) as value (value)}
									<option {value}>{value}</option>
								{/each}
							</select>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="field-label">Color</span>
							<input
								name="plates[{index}].color"
								type="text"
								class="field-input"
								bind:value={plate.color}
								autocomplete="off"
							/>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="field-label">Thickness (mm)</span>
							<input
								name="plates[{index}].thickness"
								type="number"
								class="field-input"
								min="0"
								step="0.1"
								bind:value={plate.thickness}
							/>
						</label>
					</div>
					<details class="field-group" bind:open={plate.purchaseOpen}>
						<summary>
							Purchase
							<span class="field-group-hint"
								>— {purchaseSummary(plate.purchase) ?? 'Came with the keyboard'}</span
							>
						</summary>
						<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-2">
							<PurchaseFields
								bind:purchase={plate.purchase}
								{vendors}
								{orderStatuses}
								namePrefix="plates[{index}].purchase."
							/>
						</div>
					</details>
				</fieldset>
			{/each}
			<button type="button" class="btn self-start" onclick={() => plates.push(plateDraft())}>
				+ Add plate
			</button>
		</div>
	</details>

	<details class="field-group" bind:open={pcbsOpen}>
		<summary>
			PCBs
			<span class="field-group-hint">— {pcbsSummary}</span>
		</summary>
		<div class="field-group-body flex flex-col gap-4">
			{#each pcbs as pcb, index (pcb.key)}
				<fieldset
					class="relative flex flex-col gap-4 rounded-lg border p-4"
					style="border-color: var(--border)"
				>
					<legend class="field-label px-1">PCB {index + 1}</legend>
					<button
						type="button"
						class="btn-icon absolute top-2 right-2 h-7 w-7"
						aria-label="Remove PCB {index + 1}"
						onclick={() => pcbs.splice(index, 1)}
					>
						<X class="h-4 w-4" />
					</button>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<label class="flex flex-col gap-1.5">
							<span class="field-label">Thickness (mm)</span>
							<input
								name="pcbs[{index}].thickness"
								type="number"
								class="field-input"
								min="0"
								step="0.1"
								bind:value={pcb.thickness}
							/>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="field-label">Firmware</span>
							<select
								name="pcbs[{index}].firmware"
								class="field-select w-full"
								bind:value={pcb.firmware}
							>
								<option value="">—</option>
								{#each optionsWith(firmwares, pcb.firmware) as value (value)}
									<option {value}>{value}</option>
								{/each}
							</select>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="field-label"
								>Assembly <span aria-hidden="true" style="color: var(--danger)">*</span></span
							>
							<select
								name="pcbs[{index}].assembly"
								class="field-select w-full"
								aria-required="true"
								aria-invalid={validationError !== null && !pcb.assembly.trim()}
								aria-describedby={validationError !== null && !pcb.assembly.trim()
									? validationId
									: undefined}
								bind:value={pcb.assembly}
							>
								<option value="">—</option>
								{#each optionsWith(assemblies, pcb.assembly) as value (value)}
									<option {value}>{value}</option>
								{/each}
							</select>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="field-label"
								>Connectivity <span aria-hidden="true" style="color: var(--danger)">*</span></span
							>
							<select
								name="pcbs[{index}].connectivity"
								class="field-select w-full"
								aria-required="true"
								aria-invalid={validationError !== null && !pcb.connectivity.trim()}
								aria-describedby={validationError !== null && !pcb.connectivity.trim()
									? validationId
									: undefined}
								bind:value={pcb.connectivity}
							>
								<option value="">—</option>
								{#each optionsWith(connectivities, pcb.connectivity) as value (value)}
									<option {value}>{value}</option>
								{/each}
							</select>
						</label>
					</div>
					<details class="field-group" bind:open={pcb.purchaseOpen}>
						<summary>
							Purchase
							<span class="field-group-hint"
								>— {purchaseSummary(pcb.purchase) ?? 'Came with the keyboard'}</span
							>
						</summary>
						<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-2">
							<PurchaseFields
								bind:purchase={pcb.purchase}
								{vendors}
								{orderStatuses}
								namePrefix="pcbs[{index}].purchase."
							/>
						</div>
					</details>
				</fieldset>
			{/each}
			<button type="button" class="btn self-start" onclick={() => pcbs.push(pcbDraft())}>
				+ Add PCB
			</button>
		</div>
	</details>

	<details class="field-group" bind:open={purchaseOpen}>
		<summary>
			Purchase
			<span class="field-group-hint">— {keyboardPurchaseSummary}</span>
		</summary>
		<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-2">
			<PurchaseFields
				bind:purchase
				{vendors}
				{orderStatuses}
				priceLabel="Base price"
				priceHint="Excludes plates and PCBs bought separately."
			/>
		</div>
	</details>

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
			{saving ? 'Saving…' : initial ? 'Save changes' : 'Add keyboard'}
		</button>
		<button type="button" class="btn" disabled={saving} onclick={onCancel}>Cancel</button>
	</div>
</form>

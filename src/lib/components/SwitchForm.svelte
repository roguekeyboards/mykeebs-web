<script lang="ts">
	import { isPending, uploadErrorMessage } from '#lib/image-moderation.js';
	import PendingReviewBadge from '#lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '#lib/components/RejectedImage.svelte';
	import { untrack } from 'svelte';
	import type { Switch as SwitchModel, SwitchInput } from '@rogueserenity/kbdb-api-client';
	import { Visibility } from '@rogueserenity/kbdb-api-client';
	import VisibilityPicker from './VisibilityPicker.svelte';
	import { lookupsApi } from '#lib/api/client.js';
	import { toDateInput, todayDateInput } from '#lib/format.js';

	let {
		initial,
		saving,
		error,
		onSubmit,
		onCancel,
		onImageUpload,
		onImageRemove
	}: {
		initial?: SwitchModel;
		saving: boolean;
		error: string | null;
		onSubmit: (input: SwitchInput, stagedImage?: File) => void;
		onCancel: () => void;
		onImageUpload?: (file: File) => Promise<void>;
		onImageRemove?: () => Promise<void>;
	} = $props();

	// Read once: a form keeps its in-progress edits when `initial` refreshes.
	const seed = untrack(() => initial);

	const uid = $props.id();

	let brand = $state(seed?.brand ?? '');
	let manufacturer = $state(seed?.manufacturer ?? '');
	let name = $state(seed?.name ?? '');
	let type = $state(seed?.type ?? '');
	let pins = $state(seed?.pins != null ? String(seed.pins) : '');
	let factoryLubed = $state(seed?.factoryLubed ?? false);
	let topHousing = $state(seed?.material?.topHousing ?? '');
	let bottomHousing = $state(seed?.material?.bottomHousing ?? '');
	let stem = $state(seed?.material?.stem ?? '');
	let actuation = $state<number | undefined>(seed?.force?.actuation);
	let bottomOut = $state<number | undefined>(seed?.force?.bottomOut);
	let springMaterial = $state(seed?.spring?.material ?? '');
	let preTravel = $state<number | undefined>(seed?.spring?.preTravel);
	let totalTravel = $state<number | undefined>(seed?.spring?.totalTravel);
	let vendor = $state(seed?.purchase?.vendor ?? '');
	let price = $state<number | undefined>(seed?.purchase?.price);
	let orderDate = $state(toDateInput(seed?.purchase?.orderDate));
	let deliveryDate = $state(toDateInput(seed?.purchase?.deliveryDate));
	let orderStatus = $state(seed?.purchase?.orderStatus ?? '');
	let quantity = $state<number | undefined>(seed?.purchase?.quantity);
	let notes = $state(seed?.notes ?? '');
	let visibility = $state<Visibility>(seed?.visibility ?? Visibility.Private);

	let showOrderDate = $derived(
		orderStatus.trim() !== '' && orderStatus.trim().toLowerCase() !== 'planned'
	);
	let isDelivered = $derived(orderStatus.trim().toLowerCase() === 'delivered');

	// Only clears in response to a status change, never on mount: an existing
	// item may legitimately carry dates its current status wouldn't set.
	let lastOrderStatus = seed?.purchase?.orderStatus ?? '';
	$effect(() => {
		if (orderStatus === lastOrderStatus) return;
		lastOrderStatus = orderStatus;
		if (!showOrderDate) orderDate = '';
		else if (!orderDate) orderDate = todayDateInput();
		if (!isDelivered) deliveryDate = '';
		else if (!deliveryDate) deliveryDate = todayDateInput();
	});

	let constructionOpen = $state(
		Boolean(seed?.material?.topHousing || seed?.material?.bottomHousing || seed?.material?.stem)
	);
	let feelOpen = $state(
		Boolean(
			seed?.force?.actuation != null ||
			seed?.force?.bottomOut != null ||
			seed?.spring?.material ||
			seed?.spring?.preTravel != null ||
			seed?.spring?.totalTravel != null
		)
	);
	let purchaseOpen = $state(Boolean(seed?.purchase));

	let constructionSummary = $derived(
		[topHousing, bottomHousing, stem].filter((v) => v.trim()).join(' · ') || 'Not set'
	);
	let feelSummary = $derived(
		[actuation != null ? `${actuation}g actuation` : undefined, springMaterial.trim() || undefined]
			.filter(Boolean)
			.join(' · ') || 'Not set'
	);
	let purchaseSummary = $derived(
		[vendor.trim() || undefined, orderStatus.trim() || undefined].filter(Boolean).join(' · ') ||
			'Not set'
	);

	function toNumber(value: string): number | undefined {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const n = Number(trimmed);
		return Number.isNaN(n) ? undefined : n;
	}

	let switchTypes = $state<string[]>([]);
	let switchMaterials = $state<string[]>([]);
	let springMaterials = $state<string[]>([]);
	let vendors = $state<string[]>([]);
	let orderStatuses = $state<string[]>([]);

	function optionsWith(loaded: string[], current: string): string[] {
		return current && !loaded.includes(current) ? [current, ...loaded] : loaded;
	}

	$effect(() => {
		Promise.all([
			lookupsApi.getLookup({ category: 'switch_type' }),
			lookupsApi.getLookup({ category: 'switch_material' }),
			lookupsApi.getLookup({ category: 'switch_spring_material' }),
			lookupsApi.getLookup({ category: 'vendor' }),
			lookupsApi.getLookup({ category: 'order_status' })
		])
			.then(([type, material, spring, vendor, status]) => {
				switchTypes = type.values;
				switchMaterials = material.values;
				springMaterials = spring.values;
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
			await onImageUpload(file);
		} catch (err) {
			imageError = uploadErrorMessage(err);
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

	const initialBrand = seed?.brand ?? '';
	const initialManufacturer = seed?.manufacturer ?? '';
	const initialName = seed?.name ?? '';
	const initialType = seed?.type ?? '';
	const initialPins = seed?.pins != null ? String(seed.pins) : '';
	const initialFactoryLubed = seed?.factoryLubed ?? false;
	const initialTopHousing = seed?.material?.topHousing ?? '';
	const initialBottomHousing = seed?.material?.bottomHousing ?? '';
	const initialStem = seed?.material?.stem ?? '';
	const initialActuation = seed?.force?.actuation;
	const initialBottomOut = seed?.force?.bottomOut;
	const initialSpringMaterial = seed?.spring?.material ?? '';
	const initialPreTravel = seed?.spring?.preTravel;
	const initialTotalTravel = seed?.spring?.totalTravel;
	const initialVendor = seed?.purchase?.vendor ?? '';
	const initialPrice = seed?.purchase?.price;
	const initialOrderDate = toDateInput(seed?.purchase?.orderDate);
	const initialDeliveryDate = toDateInput(seed?.purchase?.deliveryDate);
	const initialOrderStatus = seed?.purchase?.orderStatus ?? '';
	const initialQuantity = seed?.purchase?.quantity;
	const initialNotes = seed?.notes ?? '';
	const initialVisibility = seed?.visibility ?? Visibility.Private;

	export function isDirty(): boolean {
		return (
			brand !== initialBrand ||
			manufacturer !== initialManufacturer ||
			name !== initialName ||
			type !== initialType ||
			pins !== initialPins ||
			factoryLubed !== initialFactoryLubed ||
			topHousing !== initialTopHousing ||
			bottomHousing !== initialBottomHousing ||
			stem !== initialStem ||
			actuation != initialActuation ||
			bottomOut != initialBottomOut ||
			springMaterial !== initialSpringMaterial ||
			preTravel != initialPreTravel ||
			totalTravel != initialTotalTravel ||
			vendor !== initialVendor ||
			price != initialPrice ||
			orderDate !== initialOrderDate ||
			deliveryDate !== initialDeliveryDate ||
			orderStatus !== initialOrderStatus ||
			quantity != initialQuantity ||
			notes !== initialNotes ||
			visibility !== initialVisibility ||
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

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		validationError = null;

		if (!brand.trim() || !name.trim() || !type.trim()) {
			validationError = 'Brand, name, and type are required.';
			return;
		}

		const hasMaterial = topHousing.trim() || bottomHousing.trim() || stem.trim();
		const hasForce = actuation != null || bottomOut != null;
		const hasSpring = springMaterial.trim() || preTravel != null || totalTravel != null;
		const hasPurchase =
			vendor.trim() ||
			price != null ||
			orderDate.trim() ||
			deliveryDate.trim() ||
			orderStatus.trim() ||
			quantity != null;

		const input: SwitchInput = {
			brand: brand.trim(),
			manufacturer: manufacturer.trim() || undefined,
			name: name.trim(),
			type: type.trim(),
			pins: toNumber(pins),
			factoryLubed: factoryLubed || undefined,
			material: hasMaterial
				? {
						topHousing: topHousing.trim() || undefined,
						bottomHousing: bottomHousing.trim() || undefined,
						stem: stem.trim() || undefined
					}
				: undefined,
			force: hasForce
				? {
						actuation,
						bottomOut
					}
				: undefined,
			spring: hasSpring
				? {
						material: springMaterial.trim() || undefined,
						preTravel,
						totalTravel
					}
				: undefined,
			purchase: hasPurchase
				? {
						vendor: vendor.trim() || undefined,
						price,
						orderDate: orderDate.trim() ? new Date(orderDate.trim()) : undefined,
						deliveryDate: deliveryDate.trim() ? new Date(deliveryDate.trim()) : undefined,
						orderStatus: orderStatus.trim() || undefined,
						quantity
					}
				: undefined,
			notes: notes.trim() || undefined,
			visibility
		};

		onSubmit(input, stagedImage ?? undefined);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="flex flex-col gap-5" onsubmit={handleSubmit} onkeydown={guardEnterSubmit}>
	<h2 class="heading-lg text-2xl">{initial ? 'Edit switch' : 'Add switch'}</h2>

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
				alt="Selected switch"
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
			<span class="field-label"
				>Type <span aria-hidden="true" style="color: var(--danger)">*</span></span
			>
			<select
				name="type"
				class="field-select w-full"
				bind:value={type}
				aria-required="true"
				aria-invalid={validationError !== null && !type.trim()}
				aria-describedby={validationError !== null && !type.trim() ? validationId : undefined}
			>
				<option value="" disabled>Select a type…</option>
				{#each optionsWith(switchTypes, type) as value (value)}
					<option {value}>{value}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="field-label">Manufacturer</span>
			<input
				name="manufacturer"
				type="text"
				class="field-input"
				bind:value={manufacturer}
				autocomplete="off"
			/>
		</label>

		<div class="flex flex-col gap-1.5">
			<label class="field-label" for="{uid}-pins">Pins</label>
			<div class="flex items-center gap-3">
				<select id="{uid}-pins" class="field-select w-24 shrink-0" bind:value={pins}>
					<option value="">—</option>
					<option value="3">3-pin</option>
					<option value="5">5-pin</option>
				</select>
				<label class="flex items-center gap-2 whitespace-nowrap">
					<input
						name="factoryLubed"
						type="checkbox"
						class="field-checkbox"
						bind:checked={factoryLubed}
					/>
					<span class="text-sm">Factory lubed</span>
				</label>
			</div>
		</div>
	</div>

	<details class="field-group" bind:open={constructionOpen}>
		<summary>
			Construction
			<span class="field-group-hint">— {constructionSummary}</span>
		</summary>
		<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-3">
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Top housing</span>
				<select name="topHousing" class="field-select w-full" bind:value={topHousing}>
					<option value="">—</option>
					{#each optionsWith(switchMaterials, topHousing) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Bottom housing</span>
				<select name="bottomHousing" class="field-select w-full" bind:value={bottomHousing}>
					<option value="">—</option>
					{#each optionsWith(switchMaterials, bottomHousing) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Stem</span>
				<select name="stem" class="field-select w-full" bind:value={stem}>
					<option value="">—</option>
					{#each optionsWith(switchMaterials, stem) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
		</div>
	</details>

	<details class="field-group" bind:open={feelOpen}>
		<summary>
			Feel
			<span class="field-group-hint">— {feelSummary}</span>
		</summary>
		<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-2">
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Actuation force (g)</span>
				<input
					name="actuation"
					type="number"
					class="field-input"
					min="0"
					step="0.1"
					bind:value={actuation}
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Bottom-out force (g)</span>
				<input
					name="bottomOut"
					type="number"
					class="field-input"
					min="0"
					step="0.1"
					bind:value={bottomOut}
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Spring material</span>
				<select name="springMaterial" class="field-select w-full" bind:value={springMaterial}>
					<option value="">—</option>
					{#each optionsWith(springMaterials, springMaterial) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Pre-travel (mm)</span>
				<input
					name="preTravel"
					type="number"
					class="field-input"
					min="0"
					step="0.01"
					bind:value={preTravel}
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Total travel (mm)</span>
				<input
					name="totalTravel"
					type="number"
					class="field-input"
					min="0"
					step="0.01"
					bind:value={totalTravel}
				/>
			</label>
		</div>
	</details>

	<details class="field-group" bind:open={purchaseOpen}>
		<summary>
			Purchase
			<span class="field-group-hint">— {purchaseSummary}</span>
		</summary>
		<div class="field-group-body grid grid-cols-1 gap-4 sm:grid-cols-2">
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Vendor</span>
				<select name="vendor" class="field-select w-full" bind:value={vendor}>
					<option value="">—</option>
					{#each optionsWith(vendors, vendor) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Order status</span>
				<select name="orderStatus" class="field-select w-full" bind:value={orderStatus}>
					<option value="">—</option>
					{#each optionsWith(orderStatuses, orderStatus) as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Price</span>
				<input
					name="price"
					type="number"
					class="field-input"
					min="0"
					step="0.01"
					bind:value={price}
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="field-label">Quantity</span>
				<input
					name="quantity"
					type="number"
					class="field-input"
					min="0"
					step="1"
					bind:value={quantity}
				/>
			</label>
			{#if showOrderDate}
				<label class="flex flex-col gap-1.5">
					<span class="field-label">Order date</span>
					<input name="orderDate" type="date" class="field-input" bind:value={orderDate} />
				</label>
			{/if}
			{#if isDelivered}
				<label class="flex flex-col gap-1.5">
					<span class="field-label">Delivery date</span>
					<input name="deliveryDate" type="date" class="field-input" bind:value={deliveryDate} />
				</label>
			{/if}
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
			{saving ? 'Saving…' : initial ? 'Save changes' : 'Add switch'}
		</button>
		<button type="button" class="btn" disabled={saving} onclick={onCancel}>Cancel</button>
	</div>
</form>

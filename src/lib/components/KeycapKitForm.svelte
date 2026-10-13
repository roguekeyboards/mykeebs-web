<script lang="ts">
	import { isPending, uploadErrorMessage } from '$lib/image-moderation';
	import PendingReviewBadge from '$lib/components/PendingReviewBadge.svelte';
	import RejectedImage from '$lib/components/RejectedImage.svelte';
	import { untrack } from 'svelte';
	import type { KeycapKit, KeycapKitInput } from '@rogueserenity/kbdb-api-client';
	import { lookupsApi } from '$lib/api/client';
	import { toDateInput, todayDateInput } from '$lib/format';

	let {
		initial,
		isPrimary = false,
		saving,
		error,
		onSubmit,
		onCancel,
		onImageUpload,
		onImageRemove
	}: {
		initial?: KeycapKit;
		isPrimary?: boolean;
		saving: boolean;
		error: string | null;
		onSubmit: (input: KeycapKitInput, stagedImage?: File) => void;
		onCancel: () => void;
		onImageUpload?: (file: File) => Promise<void>;
		onImageRemove?: () => Promise<void>;
	} = $props();

	// Read once: a form keeps its in-progress edits when `initial` refreshes.
	const seed = untrack(() => initial);

	let name = $state(seed?.name ?? '');
	let vendor = $state(seed?.purchase?.vendor ?? '');
	let price = $state<number | undefined>(seed?.purchase?.price);
	let orderDate = $state(toDateInput(seed?.purchase?.orderDate));
	let deliveryDate = $state(toDateInput(seed?.purchase?.deliveryDate));
	let orderStatus = $state(seed?.purchase?.orderStatus ?? '');
	let primary = $state(untrack(() => isPrimary));

	let showOrderDate = $derived(
		orderStatus.trim() !== '' && orderStatus.trim().toLowerCase() !== 'planned'
	);
	let isDelivered = $derived(orderStatus.trim().toLowerCase() === 'delivered');

	// Only clears in response to a status change, never on mount: an existing
	// kit may legitimately carry dates its current status wouldn't set.
	let lastOrderStatus = seed?.purchase?.orderStatus ?? '';
	$effect(() => {
		if (orderStatus === lastOrderStatus) return;
		lastOrderStatus = orderStatus;
		if (!showOrderDate) orderDate = '';
		else if (!orderDate) orderDate = todayDateInput();
		if (!isDelivered) deliveryDate = '';
		else if (!deliveryDate) deliveryDate = todayDateInput();
	});

	let vendors = $state<string[]>([]);
	let orderStatuses = $state<string[]>([]);

	function optionsWith(loaded: string[], current: string): string[] {
		return current && !loaded.includes(current) ? [current, ...loaded] : loaded;
	}

	$effect(() => {
		Promise.all([
			lookupsApi.getLookup({ category: 'vendor' }),
			lookupsApi.getLookup({ category: 'order_status' })
		])
			.then(([vendorLookup, statusLookup]) => {
				vendors = vendorLookup.values;
				orderStatuses = statusLookup.values;
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

	const initialName = seed?.name ?? '';
	const initialVendor = seed?.purchase?.vendor ?? '';
	const initialPrice = seed?.purchase?.price;
	const initialOrderDate = toDateInput(seed?.purchase?.orderDate);
	const initialDeliveryDate = toDateInput(seed?.purchase?.deliveryDate);
	const initialOrderStatus = seed?.purchase?.orderStatus ?? '';
	const initialPrimary = untrack(() => isPrimary);

	export function isDirty(): boolean {
		return (
			name !== initialName ||
			vendor !== initialVendor ||
			price != initialPrice ||
			orderDate !== initialOrderDate ||
			deliveryDate !== initialDeliveryDate ||
			orderStatus !== initialOrderStatus ||
			primary !== initialPrimary ||
			stagedImage != null
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

		if (!name.trim()) {
			validationError = 'Name is required.';
			return;
		}

		const hasPurchase =
			vendor.trim() ||
			price != null ||
			orderDate.trim() ||
			deliveryDate.trim() ||
			orderStatus.trim();

		const input: KeycapKitInput = {
			name: name.trim(),
			purchase: hasPurchase
				? {
						vendor: vendor.trim() || undefined,
						price,
						orderDate: orderDate.trim() ? new Date(orderDate.trim()) : undefined,
						deliveryDate: deliveryDate.trim() ? new Date(deliveryDate.trim()) : undefined,
						orderStatus: orderStatus.trim() || undefined
					}
				: undefined,
			// Omitted rather than sent as false, so saving an untouched kit never
			// clears another kit's primary designation.
			primary: primary || (isPrimary ? false : undefined)
		};

		onSubmit(input, stagedImage ?? undefined);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="flex flex-col gap-5" onsubmit={handleSubmit} onkeydown={guardEnterSubmit}>
	<h2 class="heading-lg text-2xl">{initial ? 'Edit kit' : 'Add kit'}</h2>

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
				alt="Selected kit"
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

	<label class="flex flex-col gap-1.5">
		<span class="field-label"
			>Name <span aria-hidden="true" style="color: var(--danger)">*</span></span
		>
		<input
			name="name"
			type="text"
			class="field-input"
			placeholder="e.g. Base, Extension, Accents"
			bind:value={name}
			aria-required="true"
			aria-invalid={validationError !== null && !name.trim()}
			aria-describedby={validationError !== null && !name.trim() ? validationId : undefined}
			autocomplete="off"
			data-autofocus
		/>
	</label>

	<label class="flex items-center gap-2 text-sm">
		<input name="primary" type="checkbox" class="field-checkbox" bind:checked={primary} />
		Primary kit for this set
	</label>

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
			{saving ? 'Saving…' : initial ? 'Save changes' : 'Add kit'}
		</button>
		<button type="button" class="btn" disabled={saving} onclick={onCancel}>Cancel</button>
	</div>
</form>

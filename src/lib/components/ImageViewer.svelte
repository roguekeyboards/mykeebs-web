<script lang="ts">
	import { ArrowLeft, ArrowRight, X } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { motionDuration } from '#lib/motion.js';
	import { clampOffset } from '#lib/pan.js';
	let {
		open,
		src,
		alt,
		onClose,
		onPrev,
		onNext,
		itemLabel = 'photo',
		index = 0,
		count = 1
	}: {
		open: boolean;
		src: string;
		alt: string;
		onClose: () => void;
		onPrev?: () => void;
		onNext?: () => void;
		itemLabel?: string;
		index?: number;
		count?: number;
	} = $props();

	const uid = $props.id();

	const MIN_SCALE = 1;
	const MAX_SCALE = 6;

	let scale = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragOriginX = 0;
	let dragOriginY = 0;

	// Which side the next photo slides in from: 1 for the right (Next), -1 for the left.
	let direction = $state<1 | -1>(1);

	function step(delta: 1 | -1) {
		direction = delta;
		if (delta === 1) onNext?.();
		else onPrev?.();
	}

	const SWIPE_DISTANCE = 50;
	const pointers = new SvelteMap<number, { x: number; y: number }>();
	let swipeStart: { x: number; y: number } | null = null;
	let pinchStart: { distance: number; scale: number } | null = null;

	$effect(() => {
		// Switching images resets zoom.
		void src;
		if (open) {
			scale = 1;
			offsetX = 0;
			offsetY = 0;
			pointers.clear();
			swipeStart = null;
			pinchStart = null;
			dragging = false;
		}
	});

	function clampScale(value: number) {
		return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
	}

	function moveTo(x: number, y: number) {
		if (!imageEl || !stage) return;
		offsetX = clampOffset(x, imageEl.offsetWidth, scale, stage.clientWidth);
		offsetY = clampOffset(y, imageEl.offsetHeight, scale, stage.clientHeight);
	}

	function zoomTo(value: number) {
		scale = clampScale(value);
		moveTo(offsetX, offsetY);
	}

	function zoomIn() {
		zoomTo(scale + 0.5);
	}

	function zoomOut() {
		zoomTo(scale - 0.5);
	}

	function resetZoom() {
		scale = 1;
		offsetX = 0;
		offsetY = 0;
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		zoomTo(scale - event.deltaY * 0.01);
	}

	function pointerDistance() {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function startDrag(x: number, y: number) {
		dragging = true;
		dragStartX = x;
		dragStartY = y;
		dragOriginX = offsetX;
		dragOriginY = offsetY;
	}

	function handlePointerDown(event: PointerEvent) {
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		if (pointers.size === 2) {
			swipeStart = null;
			dragging = false;
			pinchStart = { distance: pointerDistance(), scale };
		} else if (pointers.size === 1) {
			if (scale > MIN_SCALE) startDrag(event.clientX, event.clientY);
			else if (event.pointerType !== 'mouse') swipeStart = { x: event.clientX, y: event.clientY };
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinchStart && pointers.size === 2) {
			const distance = pointerDistance();
			if (pinchStart.distance === 0) pinchStart = { distance, scale };
			else zoomTo((pinchStart.scale * distance) / pinchStart.distance);
		} else if (dragging) {
			moveTo(
				dragOriginX + (event.clientX - dragStartX),
				dragOriginY + (event.clientY - dragStartY)
			);
		}
	}

	function handlePointerUp(event: PointerEvent) {
		if (!pointers.delete(event.pointerId)) return;
		if (swipeStart && event.type === 'pointerup') {
			const dx = event.clientX - swipeStart.x;
			const dy = event.clientY - swipeStart.y;
			if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
				step(dx < 0 ? 1 : -1);
			}
		}
		swipeStart = null;
		dragging = false;
		if (pointers.size < 2) pinchStart = null;
		// Lifting one finger of a pinch leaves the other to move a zoomed photo.
		const [rest] = pointers.values();
		if (rest && scale > MIN_SCALE) startDrag(rest.x, rest.y);
	}

	const touchFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
	const label = $derived(itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1));

	let viewer = $state<HTMLDivElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		if (!open) return;
		const previouslyFocused = document.activeElement as HTMLElement | null;
		closeButton?.focus();
		return () => previouslyFocused?.focus();
	});

	function trapTab(event: KeyboardEvent) {
		const focusable = Array.from(
			viewer?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		} else if (!viewer?.contains(document.activeElement)) {
			event.preventDefault();
			first.focus();
		}
	}

	const PAN_STEP = 50;
	const PAN_STEP_LARGE = 200;
	let imageEl = $state<HTMLImageElement | null>(null);
	let stage = $state<HTMLDivElement | null>(null);

	function pan(dx: number, dy: number) {
		moveTo(offsetX + dx, offsetY + dy);
	}

	const arrowDirections: Record<string, [number, number]> = {
		ArrowLeft: [1, 0],
		ArrowRight: [-1, 0],
		ArrowUp: [0, 1],
		ArrowDown: [0, -1]
	};

	function handleKeydown(event: KeyboardEvent) {
		const direction = arrowDirections[event.key];
		if (event.key === 'Escape') onClose();
		else if (event.key === 'Tab') trapTab(event);
		else if (direction && scale > MIN_SCALE) {
			event.preventDefault();
			const step = event.shiftKey ? PAN_STEP_LARGE : PAN_STEP;
			pan(direction[0] * step, direction[1] * step);
		} else if (event.key === 'ArrowLeft' && onPrev) step(-1);
		else if (event.key === 'ArrowRight' && onNext) step(1);
		else if (event.key === '+' || event.key === '=') zoomIn();
		else if (event.key === '-' || event.key === '_') zoomOut();
		else if (event.key === '0') resetZoom();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div
		bind:this={viewer}
		role="dialog"
		aria-modal="true"
		aria-label="{alt}, full size"
		aria-describedby={count > 1 ? `${uid}-position` : undefined}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
		in:fade={{ duration: motionDuration(120) }}
	>
		<button
			bind:this={closeButton}
			type="button"
			aria-label="Close"
			class="btn-icon absolute top-4 right-4 z-10 bg-black/70 text-white hover:bg-black/90"
			onclick={onClose}
		>
			<X class="h-5 w-5" />
		</button>

		<div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
			<div class="flex gap-2">
				<button
					type="button"
					class="btn-icon bg-black/70 text-white hover:bg-black/90"
					aria-label="Zoom out"
					onclick={zoomOut}
				>
					−
				</button>
				<button
					type="button"
					class="btn bg-black/70 text-white hover:bg-black/90"
					aria-label="Reset zoom"
					onclick={resetZoom}
				>
					{Math.round(scale * 100)}%
				</button>
				<button
					type="button"
					class="btn-icon bg-black/70 text-white hover:bg-black/90"
					aria-label="Zoom in"
					onclick={zoomIn}
				>
					+
				</button>
			</div>
			<span class="rounded bg-black/70 px-3 py-1 text-center text-sm text-white/80">
				{#if touchFirst}
					{scale > MIN_SCALE ? 'Drag to move' : 'Pinch to zoom'}
				{:else}
					{scale > MIN_SCALE ? 'Arrow keys or drag to move' : 'Scroll to zoom'}
				{/if}
			</span>
		</div>

		{#if onPrev}
			<button
				type="button"
				aria-label="Previous {itemLabel}"
				class="btn-icon absolute top-1/2 left-4 z-10 -translate-y-1/2 bg-black/70 text-white hover:bg-black/90"
				onclick={() => step(-1)}
			>
				<ArrowLeft class="h-5 w-5" />
			</button>
		{/if}
		{#if onNext}
			<button
				type="button"
				aria-label="Next {itemLabel}"
				class="btn-icon absolute top-1/2 right-4 z-10 -translate-y-1/2 bg-black/70 text-white hover:bg-black/90"
				onclick={() => step(1)}
			>
				<ArrowRight class="h-5 w-5" />
			</button>
		{/if}

		<div
			bind:this={stage}
			class="flex h-full w-full touch-none items-center justify-center overflow-hidden {scale >
			MIN_SCALE
				? dragging
					? 'cursor-grabbing'
					: 'cursor-grab'
				: ''}"
			onwheel={handleWheel}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			role="presentation"
		>
			{#key src}
				<img
					bind:this={imageEl}
					{src}
					{alt}
					class="max-h-[90vh] max-w-[90vw] touch-none rounded select-none"
					style="transform: translate({offsetX}px, {offsetY}px) scale({scale}); transition: {pointers.size >
					0
						? 'none'
						: 'transform 0.15s ease-out'};"
					draggable="false"
					decoding="async"
					in:fly={{ x: direction * 24, duration: motionDuration(120), easing: cubicOut }}
				/>
			{/key}
		</div>

		{#if count > 1}
			<div
				aria-hidden="true"
				data-testid="pips"
				class="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/70 px-3 py-2"
			>
				{#each { length: count }, pip}
					<span class="h-2 w-2 rounded-full {pip === index ? 'bg-white' : 'bg-white/40'}"></span>
				{/each}
			</div>
			<p id="{uid}-position" class="sr-only" aria-live="polite">{label} {index + 1} of {count}</p>
		{/if}
	</div>
{/if}

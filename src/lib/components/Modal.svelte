<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { fade, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';

	let {
		open,
		onClose,
		wide = false,
		obscured = false,
		isDirty,
		headerExtra,
		label,
		children
	}: {
		open: boolean;
		onClose: () => void;
		wide?: boolean;
		obscured?: boolean;
		// Asked on each close attempt; true surfaces a "Discard changes?" prompt instead of closing.
		isDirty?: () => boolean;
		headerExtra?: Snippet;
		// Names the dialog while it has no heading, e.g. while loading or showing an error.
		label?: string;
		children: Snippet;
	} = $props();

	let confirmingDiscard = $state(false);
	let panel = $state<HTMLDivElement | null>(null);
	let keepEditingButton = $state<HTMLButtonElement | null>(null);
	const uid = $props.id();
	const headingId = `modal-heading-${uid}`;
	let labelledBy = $state<string | undefined>(undefined);

	function labelFromHeading() {
		const heading = panel?.querySelector<HTMLElement>('h1, h2, h3');
		if (!heading) {
			labelledBy = undefined;
			return;
		}
		if (!heading.id) heading.id = headingId;
		labelledBy = heading.id;
	}

	$effect(() => {
		if (!panel) return;
		labelFromHeading();
		const observer = new MutationObserver(labelFromHeading);
		observer.observe(panel, { childList: true, subtree: true });
		return () => observer.disconnect();
	});

	$effect(() => {
		if (confirmingDiscard) keepEditingButton?.focus();
	});
	let previouslyFocused: HTMLElement | null = null;

	function requestClose() {
		if (isDirty?.()) confirmingDiscard = true;
		else onClose();
	}

	function discardAndClose() {
		confirmingDiscard = false;
		onClose();
	}

	function focusableElements(): HTMLElement[] {
		if (!panel) return [];
		return Array.from(
			panel.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => el.offsetParent !== null);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (confirmingDiscard) confirmingDiscard = false;
			else requestClose();
			return;
		}

		if (event.key !== 'Tab' || obscured) return;
		const focusable = focusableElements();
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) {
			confirmingDiscard = false;
			return;
		}

		previouslyFocused = document.activeElement as HTMLElement | null;
		// Deferred so the just-opened content has mounted.
		const raf = requestAnimationFrame(() => {
			const explicit = panel?.querySelector<HTMLElement>('[data-autofocus]');
			(explicit ?? focusableElements()[0])?.focus();
		});

		return () => {
			cancelAnimationFrame(raf);
			previouslyFocused?.focus();
			previouslyFocused = null;
		};
	});
</script>

<svelte:window onkeydown={open && !obscured ? handleKeydown : undefined} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			aria-label="Close"
			class="kc-modal-backdrop absolute inset-0"
			onclick={requestClose}
			in:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
		></button>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-labelledby={labelledBy}
			aria-label={labelledBy ? undefined : label}
			in:scale={{ start: 0.97, duration: prefersReducedMotion.current ? 0 : 120, easing: backOut }}
			class="kc-modal-panel max-h-[90vh] w-full {wide
				? 'max-w-5xl'
				: 'max-w-3xl'} overflow-y-auto p-6"
		>
			{#if confirmingDiscard}
				<div
					class="mb-4 flex flex-wrap items-center gap-2 rounded border p-3"
					style="border-color: var(--danger)"
				>
					<span class="text-sm" role="alert">Discard your changes?</span>
					<button type="button" class="btn" style="color: var(--danger)" onclick={discardAndClose}>
						Discard
					</button>
					<button
						bind:this={keepEditingButton}
						type="button"
						class="btn"
						onclick={() => (confirmingDiscard = false)}
					>
						Keep editing
					</button>
				</div>
			{/if}
			<div class="absolute top-4 right-4 flex items-center gap-2">
				{#if headerExtra}
					{@render headerExtra()}
				{/if}
				<button type="button" class="btn-icon" aria-label="Close" onclick={requestClose}>
					<X class="h-5 w-5" />
				</button>
			</div>
			{@render children()}
		</div>
	</div>
{/if}

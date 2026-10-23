<script lang="ts">
	import Modal from '#lib/components/Modal.svelte';

	let { username, onDelete }: { username: string; onDelete: () => Promise<void> } = $props();

	let open = $state(false);
	let typed = $state('');
	let deleting = $state(false);
	let error = $state<string | null>(null);

	let confirmed = $derived(typed === username);

	function openDialog() {
		typed = '';
		error = null;
		open = true;
	}

	function close() {
		if (!deleting) open = false;
	}

	async function confirmDelete(event: SubmitEvent) {
		event.preventDefault();
		if (!confirmed || deleting) return;
		deleting = true;
		error = null;
		try {
			await onDelete();
		} catch {
			error = 'Your account could not be deleted. Please try again.';
			deleting = false;
		}
	}
</script>

<section class="mt-10 flex flex-col gap-3 border-t pt-6" aria-labelledby="delete-account-heading">
	<h2 id="delete-account-heading" class="section-label mb-0">Delete account</h2>
	<p class="text-muted text-sm">
		Permanently delete your profile, your whole collection and all your photos.
	</p>
	<div>
		<button type="button" class="btn" style="color: var(--danger)" onclick={openDialog}>
			Delete account
		</button>
	</div>
</section>

<Modal {open} onClose={close}>
	<form class="flex flex-col gap-4" onsubmit={confirmDelete}>
		<h2 class="heading-lg text-xl">Delete your account?</h2>
		<p class="text-sm">
			This permanently deletes your profile and avatar, every keyboard, switch, keycap set and build
			in your collection, and all of their photos. It can't be undone.
		</p>
		<label class="flex flex-col gap-1.5">
			<span class="field-label">Type <strong>{username}</strong> to confirm</span>
			<input
				name="confirmUsername"
				type="text"
				class="field-input"
				autocomplete="off"
				spellcheck="false"
				bind:value={typed}
				disabled={deleting}
				data-autofocus
			/>
		</label>
		{#if error}
			<p class="text-sm" role="alert" style="color: var(--danger)">{error}</p>
		{/if}
		<div class="flex gap-2">
			<button
				type="submit"
				class="btn"
				style="color: var(--danger)"
				disabled={!confirmed || deleting}
			>
				{deleting ? 'Deleting…' : 'Delete my account'}
			</button>
			<button type="button" class="btn" disabled={deleting} onclick={close}>Cancel</button>
		</div>
	</form>
</Modal>

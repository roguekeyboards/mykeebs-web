<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { consumeStateMatches, exchangeCodeForToken } from '#lib/auth/auth.svelte.js';

	let error = $state<string | null>(null);

	onMount(() => {
		const code = page.url.searchParams.get('code');
		// Consume the stored state either way, so a rejected redirect can't
		// leave it behind for a later replay.
		const stateMatches = consumeStateMatches(page.url.searchParams.get('state'));
		if (!code) {
			error = 'No authorization code in the redirect URL.';
			return;
		}
		if (!stateMatches) {
			error = 'Sign-in could not be verified. Please start again from the sign-in button.';
			return;
		}

		exchangeCodeForToken(code)
			// replaceState drops ?code= from history, keeping the single-use
			// code out of back-navigation and the Referer of later requests.
			.then(() => goto(resolve('/'), { replaceState: true }))
			.catch(() => {
				error = 'Sign-in failed. Please try again.';
			});
	});
</script>

<svelte:head><title>{pageTitle('Signing in')}</title></svelte:head>

<div class="flex min-h-[60vh] items-center justify-center">
	{#if error}
		<p role="alert" style="color: var(--danger)">{error}</p>
	{:else}
		<p class="text-muted font-mono text-sm tracking-wide">Signing you in&hellip;</p>
	{/if}
</div>

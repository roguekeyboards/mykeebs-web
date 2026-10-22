<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth, signIn } from '#lib/auth/auth.svelte.js';
	import { profile } from '#lib/profile/profile.svelte.js';

	$effect(() => {
		if (auth.status !== 'signed-in') return;
		if (profile.status === 'loading' || profile.status === 'idle') return;
		if (profile.status === 'ready') {
			goto(resolve('/u/[username]/keyboards', { username: profile.data!.username }), {
				replace: true
			});
		} else if (profile.status === 'none') {
			goto(resolve('profile/edit'), { replace: true });
		} else {
			goto(resolve('discover'), { replace: true });
		}
	});
</script>

<svelte:head><title>{pageTitle()}</title></svelte:head>

{#if auth.status === 'signed-out'}
	<div class="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
		<h1 class="heading-lg text-3xl">Your keyboard collection,<br /> all in one place.</h1>
		<p class="text-muted mt-4">
			Track your keyboards, switches, keycap sets and builds, from planned to delivered, and see
			what other builders are working on.
		</p>

		<button type="button" class="btn btn-accent mt-8" onclick={signIn}
			>Sign in or create an account</button
		>

		<a href={resolve('discover')} class="text-muted mt-6 text-sm hover:underline"
			>Discover builders →</a
		>
	</div>
{/if}

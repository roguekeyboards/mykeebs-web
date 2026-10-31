<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Profile } from '@roguekeyboards/mykeebs-api-client';
	import { ResponseError } from '@roguekeyboards/mykeebs-api-client';
	import { profilesApi } from '#lib/api/client.js';
	import { auth } from '#lib/auth/auth.svelte.js';
	import { setUserContext } from '#lib/user-context.js';
	import { getProfileSubNavContext } from '#lib/profile-subnav-context.js';
	import Avatar from '#lib/components/Avatar.svelte';

	const profileSubNav = getProfileSubNavContext();

	let { children } = $props();

	type ViewState =
		| { status: 'loading' }
		| { status: 'not-found' }
		| { status: 'error' }
		| { status: 'ready'; profile: Profile };

	let view = $state<ViewState>({ status: 'loading' });

	async function loadProfile(identifier: string) {
		view = { status: 'loading' };
		try {
			const profile = await profilesApi.getProfile({ identifier });
			view = { status: 'ready', profile };
		} catch (err) {
			view =
				err instanceof ResponseError && err.response.status === 404
					? { status: 'not-found' }
					: { status: 'error' };
		}
	}

	let routeUsername = $derived(page.params.username ?? '');

	$effect(() => {
		loadProfile(routeUsername);
	});

	let isOwnProfile = $derived(view.status === 'ready' && view.profile.userId === auth.user?.id);

	setUserContext({
		get userId() {
			return view.status === 'ready' ? view.profile.userId : '';
		},
		get username() {
			return view.status === 'ready' ? view.profile.username : '';
		},
		get profile() {
			if (view.status !== 'ready') throw new Error('Profile not loaded yet');
			return view.profile;
		},
		get isOwnProfile() {
			return isOwnProfile;
		},
		// mykeebs-api withholds prices a non-owner may not see, and list reads honour
		// the owner's showPriceToMe, but single-item reads (e.g. after a save)
		// always return them to the owner.
		get showPrice() {
			return (
				!isOwnProfile ||
				(view.status === 'ready' && (view.profile.preferences?.showPriceToMe ?? true))
			);
		}
	});

	const subNavItems = $derived(
		view.status === 'ready'
			? [
					{
						href: resolve('/u/[username]', { username: view.profile.username }),
						label: 'Overview'
					},
					{
						href: resolve('/u/[username]/keyboards', { username: view.profile.username }),
						label: 'Keyboards'
					},
					{
						href: resolve('/u/[username]/switches', { username: view.profile.username }),
						label: 'Switches'
					},
					{
						href: resolve('/u/[username]/keycap-sets', { username: view.profile.username }),
						label: 'Keycap Sets'
					},
					{
						href: resolve('/u/[username]/builds', { username: view.profile.username }),
						label: 'Builds'
					}
				]
			: []
	);

	// Registered for the root layout's hamburger menu, which shows these below
	// md where the tab strip is hidden.
	$effect(() => {
		if (!profileSubNav || view.status !== 'ready') return;
		const username = view.profile.username;
		profileSubNav.items = [
			{ route: '/u/[username]', username, label: 'Overview' },
			{ route: '/u/[username]/keyboards', username, label: 'Keyboards' },
			{ route: '/u/[username]/switches', username, label: 'Switches' },
			{ route: '/u/[username]/keycap-sets', username, label: 'Keycap Sets' },
			{ route: '/u/[username]/builds', username, label: 'Builds' }
		];
		return () => {
			if (profileSubNav) profileSubNav.items = [];
		};
	});
</script>

<svelte:head>
	{#if view.status === 'not-found'}
		<title>{pageTitle('Not found')}</title>
	{:else if view.status !== 'ready'}
		<title>{pageTitle(`@${routeUsername}`)}</title>
	{/if}
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	{#if view.status === 'loading'}
		<p class="text-muted p-16 text-center font-mono text-sm tracking-wide" role="status">
			Loading&hellip;
		</p>
	{:else if view.status === 'not-found'}
		<div class="flex flex-col items-center gap-2 py-24 text-center">
			<h1 class="heading-lg text-xl">No one here.</h1>
			<p class="text-muted text-sm">There's no profile at this username.</p>
		</div>
	{:else if view.status === 'error'}
		<p class="p-16 text-center text-lg" role="alert" style="color: var(--danger)">
			Could not load this profile.
		</p>
	{:else}
		{@const profile = view.profile}
		<div class="flex items-center gap-4">
			<Avatar name={profile.username} imageUrl={profile.avatar?.url} size="lg" />
			<div class="min-w-0 flex-1">
				<h1 class="heading-lg text-2xl">@{profile.username}</h1>
			</div>
		</div>

		<div class="mt-6 hidden border-b pb-2 md:block" style="border-color: var(--border)">
			<nav class="app-nav" aria-label="Profile">
				{#each subNavItems as item (item.href)}
					<a
						href={item.href}
						class="nav-key {page.url.pathname === item.href ? 'is-active' : ''}"
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>

		<div class="mt-6">
			{@render children()}
		</div>
	{/if}
</div>

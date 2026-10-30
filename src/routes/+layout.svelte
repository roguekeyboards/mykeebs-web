<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Menu, X } from '@lucide/svelte';
	import './layout.css';
	import favicon from '@roguekeyboards/mykeebs-brand/favicon.svg';
	import faviconIco from '@roguekeyboards/mykeebs-brand/favicon.ico';
	import appleTouchIcon from '@roguekeyboards/mykeebs-brand/apple-touch-icon.png';
	import logo from '@roguekeyboards/mykeebs-brand/logo-horizontal-on-dark.svg';
	import mark from '@roguekeyboards/mykeebs-brand/mark-on-dark.svg';
	import { initAuth } from '#lib/auth/auth.svelte.js';
	import { initProfile, profile } from '#lib/profile/profile.svelte.js';
	import AuthControl from '#lib/auth/AuthControl.svelte';
	import BuilderSearch from '#lib/components/BuilderSearch.svelte';
	import {
		setProfileSubNavContext,
		type ProfileSubNavContext
	} from '#lib/profile-subnav-context.js';

	let { children } = $props();

	const profileSubNav: ProfileSubNavContext = $state({ items: [] });
	setProfileSubNavContext(profileSubNav);

	onMount(() => {
		initAuth();
		initProfile();
	});

	let myCollectionHref = $derived(
		profile.status === 'ready'
			? resolve('/u/[username]/keyboards', { username: profile.data!.username })
			: undefined
	);

	const navItems = $derived(
		[
			myCollectionHref ? { href: myCollectionHref, label: 'My Collection' } : null,
			{ href: resolve('/discover'), label: 'Discover' }
		].filter((item) => item !== null)
	);

	let mobileMenuOpen = $state(false);
	$effect(() => {
		void page.url.pathname;
		mobileMenuOpen = false;
	});
</script>

<svelte:head>
	<link rel="icon" href={faviconIco} sizes="32x32" />
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
</svelte:head>
<a href="#main" class="skip-link">Skip to content</a>
<header class="app-header">
	<div class="md:hidden">
		<button
			type="button"
			class="btn-icon"
			aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
			aria-expanded={mobileMenuOpen}
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
		>
			{#if mobileMenuOpen}
				<X class="mx-auto h-5 w-5" />
			{:else}
				<Menu class="mx-auto h-5 w-5" />
			{/if}
		</button>
	</div>
	<div class="app-brand">
		<img src={mark} alt="mykeebs" class="sm:hidden" />
		<img src={logo} alt="mykeebs" class="hidden sm:block" />
	</div>
	<div class="hidden md:block">
		<nav class="app-nav" aria-label="Main">
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="nav-key {page.url.pathname.startsWith(item.href) ? 'is-active' : ''}"
					aria-current={page.url.pathname.startsWith(item.href) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>
	</div>
	<BuilderSearch class="hidden md:block" />
	<div class="ml-auto flex min-w-0 items-center">
		<AuthControl />
	</div>
</header>
{#if mobileMenuOpen}
	<div class="app-mobile-menu md:hidden">
		<nav class="flex flex-col gap-1" aria-label="Main">
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="nav-key {page.url.pathname.startsWith(item.href) ? 'is-active' : ''}"
					aria-current={page.url.pathname.startsWith(item.href) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>
		{#if profileSubNav.items.length > 0}
			<div class="profile-menu-divider"></div>
			<nav class="flex flex-col gap-1" aria-label="Profile">
				{#each profileSubNav.items as item (item.route)}
					{@const href = resolve(item.route, { username: item.username })}
					<a
						{href}
						class="nav-key {page.url.pathname === href ? 'is-active' : ''}"
						aria-current={page.url.pathname === href ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		{/if}
	</div>
{/if}
<main id="main" tabindex="-1">
	{@render children()}
</main>
<footer class="app-footer">
	<a href="https://mykeebs.com/" rel="external">About mykeebs</a>
	<a href="https://mykeebs.com/help/mcp" rel="external">Use with AI Assistants</a>
	<a href="https://mykeebs.com/about/ai" rel="external">How We Use AI</a>
	<a href="https://mykeebs.com/privacy" rel="external">Privacy Policy</a>
	<a href="https://mykeebs.com/terms" rel="external">Terms of Service</a>
	<a href="https://mykeebs.com/contact" rel="external">Contact</a>
</footer>

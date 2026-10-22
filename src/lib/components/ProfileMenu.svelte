<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth, signOut } from '$lib/auth/auth.svelte';
	import { profile } from '$lib/profile/profile.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	let displayName = $derived(profile.data?.username ?? auth.user?.email?.split('@')[0] ?? 'you');
	let hasProfile = $derived(profile.status === 'ready');

	let open = $state(false);
	let menuEl = $state<HTMLDivElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	const uid = $props.id();
	const panelId = `account-panel-${uid}`;

	function handleDocumentClick(event: MouseEvent) {
		if (open && menuEl && !menuEl.contains(event.target as Node)) {
			open = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		open = false;
		trigger?.focus();
	}
</script>

<svelte:window onclick={handleDocumentClick} onkeydown={open ? handleKeydown : undefined} />

<div class="relative" bind:this={menuEl}>
	<button
		type="button"
		bind:this={trigger}
		class="profile-trigger"
		aria-expanded={open}
		aria-controls={panelId}
		onclick={() => (open = !open)}
	>
		<Avatar name={displayName} imageUrl={profile.data?.avatar?.url} size="sm" />
		<span class="profile-trigger-name font-mono text-sm">{displayName}</span>
	</button>

	{#if open}
		<div id={panelId} class="profile-menu">
			<div class="flex items-center gap-3 px-2 pb-3">
				<Avatar name={displayName} imageUrl={profile.data?.avatar?.url} size="lg" />
				<div class="min-w-0">
					<p class="heading-lg truncate text-sm" title={displayName}>
						{#if hasProfile}@{displayName}{:else}{displayName}{/if}
					</p>
					{#if profile.data?.discordUsername}
						<p class="text-faint truncate font-mono text-xs" title={profile.data.discordUsername}>
							{profile.data.discordUsername}
						</p>
					{/if}
				</div>
			</div>
			<div class="profile-menu-divider"></div>

			<a href={resolve('profile/edit')} class="profile-menu-item" onclick={() => (open = false)}
				>{hasProfile ? 'Edit profile' : 'Set up your profile'}</a
			>

			<div class="profile-menu-divider"></div>
			<button
				type="button"
				class="profile-menu-item"
				onclick={() => {
					open = false;
					signOut();
				}}
			>
				Sign out
			</button>
		</div>
	{/if}
</div>

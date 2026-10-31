<script lang="ts">
	import { pageTitle } from '#lib/page-title.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ProfileInput, ProfileLink } from '@roguekeyboards/mykeebs-api-client';
	import { ResponseError } from '@roguekeyboards/mykeebs-api-client';
	import { auth } from '#lib/auth/auth.svelte.js';
	import { profile, saveProfile, refreshProfile } from '#lib/profile/profile.svelte.js';
	import { profilesApi } from '#lib/api/client.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import { X } from '@lucide/svelte';
	import { cleanLinks, USERNAME_RULES, usernameLooksValid } from '#lib/profile/profile-input.js';
	import { pickedUploadMessage, uploadEach, uploadImage } from '#lib/upload.js';
	import { isPending, rejectionText } from '#lib/image-moderation.js';
	import DeleteAccount from '#lib/account/DeleteAccount.svelte';
	import { deleteAccount } from '#lib/account/delete-account.js';

	const MAX_LINKS = 5;

	// For browsers without Intl.supportedValuesOf (older Safari).
	const FALLBACK_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
	const CURRENCY_CODES: string[] =
		typeof Intl.supportedValuesOf === 'function'
			? Intl.supportedValuesOf('currency')
			: FALLBACK_CURRENCIES;

	const currencyDisplayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
	const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
		code,
		label: `${currencyDisplayNames.of(code) ?? code} (${code})`
	})).sort((a, b) => a.label.localeCompare(b.label));

	let username = $state('');
	let discordUsername = $state('');
	let bio = $state('');
	let discoverable = $state(false);
	let links = $state<ProfileLink[]>([]);
	// Mirrors kbdb's defaults for a profile with no preferences set.
	let currency = $state('USD');
	let showPriceToMe = $state(true);
	let showPriceToOthers = $state(false);

	let seeded = false;
	$effect(() => {
		if (seeded) return;
		if (profile.status === 'ready') {
			const p = profile.data!;
			username = p.username;
			discordUsername = p.discordUsername ?? '';
			bio = p.bio ?? '';
			discoverable = p.discoverable;
			links = (p.links ?? []).map((l) => ({ ...l }));
			currency = p.preferences?.currency ?? 'USD';
			showPriceToMe = p.preferences?.showPriceToMe ?? true;
			showPriceToOthers = p.preferences?.showPriceToOthers ?? false;
			seeded = true;
		} else if (profile.status === 'none') {
			seeded = true;
		}
	});

	let isNew = $derived(profile.status === 'none');
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let usernameError = $state<string | null>(null);
	const uid = $props.id();
	const usernameErrorId = `username-error-${uid}`;

	let usernameValid = $derived(usernameLooksValid(username));

	function addLink() {
		if (links.length < MAX_LINKS) links = [...links, { name: '', url: '' }];
	}

	function removeLink(index: number) {
		links = links.filter((_, i) => i !== index);
	}

	function handleCancel() {
		if (profile.status === 'ready') {
			goto(resolve('/u/[username]', { username: profile.data!.username }));
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		formError = null;
		usernameError = null;

		if (!usernameValid) {
			usernameError = USERNAME_RULES;
			return;
		}

		const cleaned = cleanLinks(links);
		if ('error' in cleaned) {
			formError = cleaned.error;
			return;
		}
		const cleanedLinks = cleaned.links;

		const input: ProfileInput = {
			username,
			discoverable,
			discordUsername: discordUsername.trim() || undefined,
			bio: bio.trim() || undefined,
			links: cleanedLinks.length > 0 ? cleanedLinks : undefined,
			preferences: { currency, showPriceToMe, showPriceToOthers }
		};

		saving = true;
		try {
			const saved = await saveProfile(input);
			goto(resolve('/u/[username]', { username: saved.username }));
		} catch (err) {
			if (err instanceof ResponseError && err.response.status === 409) {
				const body = await err.response.json().catch(() => null);
				if (body?.type?.includes('username-unavailable')) {
					usernameError = 'That username is already taken.';
				} else {
					formError = 'Your profile was changed elsewhere. Reload and try again.';
				}
			} else {
				formError = 'Could not save your profile.';
			}
		} finally {
			saving = false;
		}
	}

	let avatarBusy = $state(false);
	let avatarError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function onAvatarPick(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || !auth.user) return;
		avatarError = null;
		avatarBusy = true;
		try {
			const identifier = auth.user.id;
			const failure = await uploadEach([file], (photo) =>
				uploadImage(photo, (imageUploadRequest) =>
					profilesApi.setProfileImage({ identifier, imageUploadRequest })
				)
			);
			if (failure) avatarError = pickedUploadMessage(failure);
			else await refreshProfile().catch(() => {});
		} finally {
			avatarBusy = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function removeAvatar() {
		if (!auth.user) return;
		avatarError = null;
		avatarBusy = true;
		try {
			await profilesApi.deleteProfileImage({ identifier: auth.user.id });
			await refreshProfile();
		} catch {
			avatarError = 'Could not remove your photo.';
		} finally {
			avatarBusy = false;
		}
	}
</script>

<svelte:head><title>{pageTitle(isNew ? 'Set up profile' : 'Edit profile')}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-10">
	{#if auth.status === 'loading' || profile.status === 'loading' || profile.status === 'idle'}
		<p class="text-muted p-16 text-center font-mono text-sm tracking-wide" role="status">
			Loading&hellip;
		</p>
	{:else if auth.status === 'signed-out'}
		<p class="text-muted p-16 text-center text-lg">Sign in to edit your profile.</p>
	{:else if profile.status === 'error'}
		<p class="p-16 text-center text-lg" role="alert" style="color: var(--danger)">
			Could not load your profile.
		</p>
	{:else}
		<h1 class="heading-lg text-2xl">{isNew ? "Let's set up your profile" : 'Edit profile'}</h1>
		<p class="text-muted mt-1 text-sm">
			{isNew
				? "Pick a username to get started - that's the only thing you need right now."
				: 'Update how you appear to other collectors.'}
		</p>

		<div class="mt-8 flex items-center gap-4">
			<Avatar
				name={username || 'you'}
				imageUrl={profile.data?.avatar?.url}
				size="lg"
				label="Your profile photo"
			/>
			<div class="flex flex-col gap-2">
				<div class="flex gap-2">
					<button
						type="button"
						class="btn"
						disabled={isNew || avatarBusy}
						onclick={() => fileInput?.click()}
					>
						{avatarBusy ? 'Working…' : 'Change photo'}
					</button>
					{#if profile.data?.avatar}
						<button type="button" class="btn" disabled={avatarBusy} onclick={removeAvatar}>
							Remove
						</button>
					{/if}
				</div>
				{#if isNew}
					<span class="text-faint text-xs">Save your profile first, then add a photo.</span>
				{/if}
				{#if profile.data?.avatar && !profile.data.avatar.url}
					<span class="text-xs" style="color: var(--danger)">
						{rejectionText(profile.data.avatar.rejectionReason)}. Remove it or choose another photo.
					</span>
				{:else if isPending(profile.data?.avatar)}
					<span class="text-faint text-xs"
						>Pending review. Only you can see it until it's approved.</span
					>
				{/if}
				{#if avatarError}
					<span class="text-xs" role="alert" style="color: var(--danger)">{avatarError}</span>
				{/if}
			</div>
			<input
				name="avatar"
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="hidden"
				onchange={onAvatarPick}
			/>
		</div>

		<form class="mt-8 flex flex-col gap-5" onsubmit={handleSubmit}>
			<label class="flex flex-col gap-1.5">
				<span class="section-label mb-0"
					>Username <span aria-hidden="true" style="color: var(--danger)">*</span></span
				>
				<input
					name="username"
					type="text"
					class="field-input font-mono"
					maxlength="32"
					bind:value={username}
					aria-required="true"
					aria-invalid={usernameError !== null}
					aria-describedby={usernameError !== null ? usernameErrorId : undefined}
					autocomplete="off"
				/>
				<span class="text-faint text-xs">
					Your profile will be at /u/{usernameValid ? username : 'username'}
				</span>
				{#if usernameError}
					<span id={usernameErrorId} class="text-xs" role="alert" style="color: var(--danger)"
						>{usernameError}</span
					>
				{/if}
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="section-label mb-0">Discord username</span>
				<input
					name="discordUsername"
					type="text"
					class="field-input font-mono"
					maxlength="32"
					placeholder="e.g. jayb"
					bind:value={discordUsername}
				/>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="section-label mb-0">Bio</span>
				<textarea name="bio" class="field-input" rows="3" maxlength="500" bind:value={bio}
				></textarea>
				<span class="text-faint text-xs">{bio.length}/500</span>
			</label>

			<div class="flex flex-col gap-2">
				<span class="section-label mb-0">Links</span>
				{#each links as link, index (index)}
					<div class="flex gap-2">
						<input
							name="linkName"
							type="text"
							class="field-input w-1/3"
							aria-label="Link {index + 1} label"
							placeholder="Label"
							maxlength="32"
							bind:value={link.name}
						/>
						<input
							name="linkUrl"
							type="url"
							class="field-input flex-1 font-mono"
							aria-label="Link {index + 1} URL"
							placeholder="https://…"
							bind:value={link.url}
						/>
						<button
							type="button"
							class="btn-icon"
							aria-label={link.name.trim()
								? `Remove ${link.name.trim()} link`
								: `Remove link ${index + 1}`}
							onclick={() => removeLink(index)}
						>
							<X class="h-5 w-5" />
						</button>
					</div>
				{/each}
				{#if links.length < MAX_LINKS}
					<button type="button" class="btn self-start" onclick={addLink}>Add link</button>
				{/if}
			</div>

			<div class="flex flex-col gap-3">
				<span class="section-label mb-0">Prices</span>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm">Currency</span>
					<select name="currency" class="field-select w-56" bind:value={currency}>
						{#each CURRENCY_OPTIONS as option (option.code)}
							<option value={option.code}>{option.label}</option>
						{/each}
					</select>
					<span class="text-faint text-xs">
						Used to label your prices. kbdb doesn't convert between currencies.
					</span>
				</label>

				<label class="flex items-center gap-2">
					<input
						name="showPriceToMe"
						type="checkbox"
						class="field-checkbox"
						bind:checked={showPriceToMe}
					/>
					<span class="text-sm">Show prices to me</span>
				</label>
				<p class="text-faint -mt-2 text-xs">
					Show prices in your collection lists. You'll still see an item's price when editing it,
					since editing requires the current value.
				</p>

				<label class="flex items-center gap-2">
					<input
						name="showPriceToOthers"
						type="checkbox"
						class="field-checkbox"
						bind:checked={showPriceToOthers}
					/>
					<span class="text-sm">Show prices to others</span>
				</label>
				<p class="text-faint -mt-2 text-xs">
					Let other people who can already see an item also see its price. Individual item
					visibility settings still apply first.
				</p>
			</div>

			<div class="flex flex-col gap-3">
				<span class="section-label mb-0">Discoverability</span>

				<label class="flex items-center gap-2">
					<input
						name="discoverable"
						type="checkbox"
						class="field-checkbox"
						bind:checked={discoverable}
					/>
					<span class="text-sm">Make my profile discoverable</span>
				</label>
				<p class="text-faint -mt-2 text-xs">
					Others can find you in Discover and view /u/{usernameValid ? username : 'username'}.
					Individual builds still use their own visibility setting.
				</p>
			</div>

			{#if formError}
				<p class="text-sm" role="alert" style="color: var(--danger)">{formError}</p>
			{/if}

			<div class="mt-2 flex gap-2">
				<button type="submit" class="btn btn-accent" disabled={saving}>
					{saving ? 'Saving…' : isNew ? 'Create profile' : 'Save changes'}
				</button>
				{#if !isNew}
					<button type="button" class="btn" disabled={saving} onclick={handleCancel}>
						Cancel
					</button>
				{/if}
			</div>
		</form>
		{#if profile.status === 'ready' && auth.user}
			{@const userId = auth.user.id}
			<DeleteAccount username={profile.data!.username} onDelete={() => deleteAccount(userId)} />
		{/if}
	{/if}
</div>

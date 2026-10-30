import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus, ResponseError, type Profile } from '@roguekeyboards/kbdb-api-client';
import { goto } from '$app/navigation';
import { profilesApi } from '#lib/api/client.js';
import { refreshProfile, saveProfile } from '#lib/profile/profile.svelte.js';
import ProfileEditPage from './+page.svelte';
import { MAX_IMAGE_BYTES, UnsupportedImageError } from '#lib/image-errors.js';
import { prepareImage } from '#lib/image-resize.js';
import { deleteAccount } from '#lib/account/delete-account.js';

vi.mock('#lib/image-resize.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/image-resize.js')>()),
	prepareImage: vi.fn(
		async (file: File) =>
			new File([file], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
	)
}));

const existing = vi.hoisted((): Profile => ({
	userId: 'user-1',
	username: 'rogue.serenity',
	discoverable: true,
	discordUsername: 'rogue#1',
	bio: 'No, I am a meat popsicle.',
	preferences: { currency: 'EUR', showPriceToMe: false, showPriceToOthers: true },
	avatar: { url: 'https://img.example/avatar.png' },
	links: [
		{ name: 'GitHub', url: 'https://github.com/rogueserenity' },
		{ name: 'Mastodon', url: 'https://example.social/@rogue' }
	]
}));

const authState = vi.hoisted(() => ({
	status: 'signed-in',
	user: { id: 'user-1' } as { id: string } | null
}));

vi.mock('#lib/auth/auth.svelte.js', () => ({ auth: authState }));
const profileState = vi.hoisted(() => ({ status: 'ready', data: undefined as unknown }));

vi.mock('#lib/profile/profile.svelte.js', () => ({
	profile: profileState,
	saveProfile: vi.fn(),
	refreshProfile: vi.fn(async () => {})
}));
vi.mock('#lib/api/client.js', () => ({
	profilesApi: { setProfileImage: vi.fn(), deleteProfileImage: vi.fn() }
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('#lib/account/delete-account.js', () => ({ deleteAccount: vi.fn(async () => {}) }));

beforeEach(() => {
	vi.clearAllMocks();
	authState.status = 'signed-in';
	authState.user = { id: 'user-1' };
	profileState.status = 'ready';
	profileState.data = existing;
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Profile edit page links', () => {
	it('names each remove button after its link and removes only that link', async () => {
		await render(ProfileEditPage);

		await page.getByRole('button', { name: 'Remove GitHub link' }).click();

		await expect
			.element(page.getByRole('button', { name: 'Remove GitHub link' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Remove Mastodon link' }))
			.toBeInTheDocument();
	});

	it('falls back to the position for a link without a label yet', async () => {
		await render(ProfileEditPage);

		await page.getByRole('button', { name: 'Add link' }).click();

		await expect.element(page.getByRole('button', { name: 'Remove link 3' })).toBeInTheDocument();
	});
});

describe('Profile edit page link fields', () => {
	it('labels each link field by its position', async () => {
		await render(ProfileEditPage);

		await expect.element(page.getByRole('textbox', { name: 'Link 1 label' })).toHaveValue('GitHub');
		await expect
			.element(page.getByRole('textbox', { name: 'Link 1 URL' }))
			.toHaveValue('https://github.com/rogueserenity');
		await expect
			.element(page.getByRole('textbox', { name: 'Link 2 label' }))
			.toHaveValue('Mastodon');
		await expect
			.element(page.getByRole('textbox', { name: 'Link 2 URL' }))
			.toHaveValue('https://example.social/@rogue');
	});
});

describe('Profile edit page title', () => {
	it('titles the tab for editing an existing profile', async () => {
		await render(ProfileEditPage);

		await vi.waitFor(() => expect(document.title).toBe('Edit profile · mykeebs'));
	});

	it('titles the tab for setting up a new profile', async () => {
		profileState.status = 'none';
		profileState.data = undefined;

		await render(ProfileEditPage);

		await vi.waitFor(() => expect(document.title).toBe('Set up profile · mykeebs'));
	});
});

const save = vi.mocked(saveProfile);
const api = vi.mocked(profilesApi);

function conflict(type: string): ResponseError {
	return new ResponseError(
		new Response(JSON.stringify({ type, status: 409 }), {
			status: 409,
			headers: { 'Content-Type': 'application/problem+json' }
		})
	);
}

const usernameField = () => page.getByLabelText(/^Username/);
const saveButton = () => page.getByRole('button', { name: 'Save changes' });

describe('Profile edit page states', () => {
	it('waits while auth or the profile is loading', async () => {
		profileState.status = 'loading';
		await render(ProfileEditPage);

		await expect
			.element(page.getByRole('status').filter({ hasText: 'Loading…' }))
			.toBeInTheDocument();
	});

	it('asks a signed-out visitor to sign in', async () => {
		authState.status = 'signed-out';
		authState.user = null;
		await render(ProfileEditPage);

		await expect.element(page.getByText('Sign in to edit your profile.')).toBeInTheDocument();
	});

	it('says so when the profile fails to load', async () => {
		profileState.status = 'error';
		await render(ProfileEditPage);

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not load your profile.' }))
			.toBeInTheDocument();
	});

	it('fills the form from the existing profile', async () => {
		await render(ProfileEditPage);

		await expect.element(usernameField()).toHaveValue('rogue.serenity');
		await expect.element(page.getByLabelText('Discord username')).toHaveValue('rogue#1');
		await expect
			.element(page.getByLabelText('Bio', { exact: false }))
			.toHaveValue('No, I am a meat popsicle.');
		await expect.element(page.getByLabelText('Currency', { exact: false })).toHaveValue('EUR');
		await expect.element(page.getByLabelText('Show prices to me')).not.toBeChecked();
		await expect.element(page.getByLabelText('Show prices to others')).toBeChecked();
		await expect.element(page.getByLabelText('Make my profile discoverable')).toBeChecked();
	});

	it('sets up a new profile without a photo or cancel until it is saved', async () => {
		profileState.status = 'none';
		profileState.data = undefined;
		await render(ProfileEditPage);

		await expect
			.element(page.getByRole('heading', { name: "Let's set up your profile" }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Change photo' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Create profile' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
	});
});

describe('Profile edit page saving', () => {
	it('saves the trimmed profile and goes to it', async () => {
		save.mockResolvedValue({ ...existing, username: 'rogue.serenity' });
		await render(ProfileEditPage);

		await page.getByLabelText('Discord username').fill('  ');
		await page.getByLabelText('Bio', { exact: false }).fill('  Clacky.  ');
		await page.getByRole('button', { name: 'Add link' }).click();
		await saveButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/u/rogue.serenity'));
		expect(save).toHaveBeenCalledWith({
			username: 'rogue.serenity',
			discoverable: true,
			discordUsername: undefined,
			bio: 'Clacky.',
			links: existing.links,
			preferences: { currency: 'EUR', showPriceToMe: false, showPriceToOthers: true }
		});
	});

	it('shows where the profile will live as the username is typed', async () => {
		await render(ProfileEditPage);

		await usernameField().fill('keeb.fan');

		await expect.element(page.getByText('Your profile will be at /u/keeb.fan')).toBeInTheDocument();
	});

	it('refuses an invalid username', async () => {
		await render(ProfileEditPage);

		await usernameField().fill('Not Valid');
		await saveButton().click();

		await expect.element(page.getByText(/^3–32 chars/)).toBeInTheDocument();
		expect(save).not.toHaveBeenCalled();
	});

	it('refuses a link with no URL', async () => {
		await render(ProfileEditPage);

		await page.getByRole('textbox', { name: 'Link 2 URL' }).fill('');
		await saveButton().click();

		await expect
			.element(page.getByText('Each link needs both a name and a URL.'))
			.toBeInTheDocument();
		expect(save).not.toHaveBeenCalled();
	});

	it('refuses a link that is not https', async () => {
		await render(ProfileEditPage);

		await page.getByRole('textbox', { name: 'Link 2 URL' }).fill('http://example.social/@rogue');
		await saveButton().click();

		await expect.element(page.getByText('Link URLs must start with https://.')).toBeInTheDocument();
		expect(save).not.toHaveBeenCalled();
	});

	it('says when the username is taken', async () => {
		save.mockRejectedValue(conflict('https://kbdb.dev/problems/username-unavailable'));
		await render(ProfileEditPage);

		await saveButton().click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'That username is already taken.' }))
			.toBeInTheDocument();
		const usernameField = page.getByRole('textbox', { name: /^Username/ });
		await expect.element(usernameField).toBeRequired();
		await expect.element(usernameField).toBeInvalid();
		await expect
			.element(usernameField)
			.toHaveAccessibleDescription('That username is already taken.');
	});

	it('says when the profile changed elsewhere', async () => {
		save.mockRejectedValue(conflict('https://kbdb.dev/problems/version-conflict'));
		await render(ProfileEditPage);

		await saveButton().click();

		await expect
			.element(page.getByText('Your profile was changed elsewhere. Reload and try again.'))
			.toBeInTheDocument();
	});

	it('says when the save fails for any other reason', async () => {
		save.mockRejectedValue(new Error('network'));
		await render(ProfileEditPage);

		await saveButton().click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not save your profile.' }))
			.toBeInTheDocument();
	});

	it('cancels back to the profile', async () => {
		await render(ProfileEditPage);

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(goto).toHaveBeenCalledWith('/u/rogue.serenity');
	});
});

describe('Profile edit page photo', () => {
	const fileInput = () => page.elementLocator(document.querySelector('input[type="file"]')!);
	const png = new File(['png'], 'me.png', { type: 'image/png' });

	it('uploads a new photo and refreshes the profile', async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		api.setProfileImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/me' } as never);
		await render(ProfileEditPage);

		await userEvent.upload(fileInput(), png);

		await vi.waitFor(() => expect(refreshProfile).toHaveBeenCalled());
		expect(api.setProfileImage).toHaveBeenCalledWith({
			identifier: 'user-1',
			imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'https://bucket.example/me',
			expect.objectContaining({ method: 'PUT' })
		);
	});

	it('says so, without asking for an upload URL, when the image cannot be read', async () => {
		vi.mocked(prepareImage).mockRejectedValueOnce(new UnsupportedImageError());
		await render(ProfileEditPage);

		await userEvent.upload(fileInput(), new File(['heic'], 'me.heic', { type: 'image/heic' }));

		await expect
			.element(
				page.getByRole('alert').filter({
					hasText:
						"That photo wasn't added. It's in a format this browser can't read. Add a different one."
				})
			)
			.toBeInTheDocument();
		expect(api.setProfileImage).not.toHaveBeenCalled();
	});

	it('says so, without asking for an upload URL, when the image is too large', async () => {
		vi.mocked(prepareImage).mockResolvedValueOnce(
			new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'me.webp', { type: 'image/webp' })
		);
		await render(ProfileEditPage);

		await userEvent.upload(fileInput(), png);

		await expect
			.element(
				page.getByRole('alert').filter({
					hasText:
						"That photo wasn't added. It's too detailed to fit under 1.5 MB. Add a different one."
				})
			)
			.toBeInTheDocument();
		expect(api.setProfileImage).not.toHaveBeenCalled();
	});

	it("doesn't call an uploaded photo failed when refreshing the profile fails", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 }))
		);
		api.setProfileImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/me' } as never);
		vi.mocked(refreshProfile).mockRejectedValueOnce(new Error('network'));
		await render(ProfileEditPage);

		await userEvent.upload(fileInput(), png);

		await vi.waitFor(() => expect(refreshProfile).toHaveBeenCalled());
		await expect.element(page.getByText("wasn't added", { exact: false })).not.toBeInTheDocument();
	});

	it('says so when the upload fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 403 }))
		);
		api.setProfileImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/me' } as never);
		await render(ProfileEditPage);

		await userEvent.upload(fileInput(), png);

		await expect
			.element(
				page.getByRole('alert').filter({ hasText: "That photo wasn't added. Add it again." })
			)
			.toBeInTheDocument();
		expect(refreshProfile).not.toHaveBeenCalled();
	});

	it('removes the photo and refreshes the profile', async () => {
		api.deleteProfileImage.mockResolvedValue(undefined);
		await render(ProfileEditPage);

		await page.getByRole('button', { name: 'Remove' }).click();

		await vi.waitFor(() => expect(refreshProfile).toHaveBeenCalled());
		expect(api.deleteProfileImage).toHaveBeenCalledWith({ identifier: 'user-1' });
	});

	it('says so when removing the photo fails', async () => {
		api.deleteProfileImage.mockRejectedValue(new Error('network'));
		await render(ProfileEditPage);

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not remove your photo.' }))
			.toBeInTheDocument();
	});

	it('says uploads are unavailable when kbdb refuses with a 429', async () => {
		api.setProfileImage.mockRejectedValue(
			new ResponseError(
				new Response(null, { status: 429, headers: { 'Content-Type': 'application/problem+json' } })
			)
		);
		await render(ProfileEditPage);

		await userEvent.upload(fileInput(), png);

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Uploads unavailable, try again later.' }))
			.toBeInTheDocument();
	});

	it('marks a photo that is pending review', async () => {
		profileState.data = {
			...existing,
			avatar: { url: 'https://img.example/new.png', status: ImageStatus.Pending }
		};
		await render(ProfileEditPage);

		await expect.element(page.getByText(/^Pending review/)).toBeInTheDocument();
	});

	it('explains a rejected photo and still offers to remove it', async () => {
		profileState.data = {
			...existing,
			avatar: { status: ImageStatus.Rejected, rejectionReason: 'Explicit' }
		};
		await render(ProfileEditPage);

		await expect.element(page.getByText(/Removed by moderation: Explicit/)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
	});
});

describe('Profile edit page account deletion', () => {
	it("deletes the signed-in user's own account once their username is typed", async () => {
		await render(ProfileEditPage);

		await page.getByRole('button', { name: 'Delete account' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
		await dialog.getByRole('textbox').fill('rogue.serenity');
		await dialog.getByRole('button', { name: 'Delete my account' }).click();

		expect(deleteAccount).toHaveBeenCalledWith('user-1');
	});

	it('offers no account deletion while the profile is still being set up', async () => {
		profileState.status = 'none';
		profileState.data = undefined;
		await render(ProfileEditPage);

		await expect
			.element(page.getByRole('heading', { name: "Let's set up your profile" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Delete account' }))
			.not.toBeInTheDocument();
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponseError, type Profile } from '@rogueserenity/kbdb-api-client';

vi.mock('#lib/auth/auth.svelte.js', async () => {
	const { authState } = await import('#lib/test-support/auth-state.svelte.js');
	return { auth: authState };
});
vi.mock('#lib/api/client.js', () => ({
	profilesApi: { getProfile: vi.fn(), createProfile: vi.fn(), updateProfile: vi.fn() }
}));

type Store = typeof import('./profile.svelte');
let store: Store;
let authState: { user: { id: string; email: string | null } | null };
let api: {
	getProfile: ReturnType<typeof vi.fn>;
	createProfile: ReturnType<typeof vi.fn>;
	updateProfile: ReturnType<typeof vi.fn>;
};

const rogue: Profile = { userId: 'user-1', username: 'rogue.serenity', discoverable: true };

function notFound(): ResponseError {
	return new ResponseError(new Response(null, { status: 404 }));
}

function signIn(id = 'user-1') {
	authState.user = { id, email: null };
}

beforeEach(async () => {
	vi.resetModules();
	({ authState } = await import('#lib/test-support/auth-state.svelte.js'));
	authState.user = null;
	api = (await import('#lib/api/client.js')).profilesApi as never;
	api.getProfile.mockReset().mockResolvedValue(rogue);
	api.createProfile.mockReset();
	api.updateProfile.mockReset();
	store = await import('./profile.svelte');
});

describe('profile store', () => {
	it('stays idle while signed out', async () => {
		store.initProfile();

		await Promise.resolve();
		expect(store.profile.status).toBe('idle');
		expect(store.profile.data).toBeNull();
		expect(api.getProfile).not.toHaveBeenCalled();
	});

	it("loads the signed-in user's profile", async () => {
		signIn();
		store.initProfile();

		await vi.waitFor(() => expect(store.profile.status).toBe('ready'));
		expect(store.profile.data).toEqual(rogue);
		expect(api.getProfile).toHaveBeenCalledWith({ identifier: 'user-1' });
	});

	it('is none when the user has no profile yet', async () => {
		api.getProfile.mockRejectedValue(notFound());
		signIn();
		store.initProfile();

		await vi.waitFor(() => expect(store.profile.status).toBe('none'));
		expect(store.profile.data).toBeNull();
	});

	it('is an error when loading fails for any other reason', async () => {
		api.getProfile.mockRejectedValue(new Error('network'));
		signIn();
		store.initProfile();

		await vi.waitFor(() => expect(store.profile.status).toBe('error'));
	});

	it('reloads for a different user and goes idle on sign-out', async () => {
		signIn('user-1');
		store.initProfile();
		await vi.waitFor(() => expect(store.profile.status).toBe('ready'));

		api.getProfile.mockResolvedValue({ ...rogue, userId: 'user-2', username: 'other' });
		signIn('user-2');
		await vi.waitFor(() => expect(store.profile.data?.username).toBe('other'));

		authState.user = null;
		await vi.waitFor(() => expect(store.profile.status).toBe('idle'));
		expect(api.getProfile).toHaveBeenCalledTimes(2);
	});

	it('does not reload when the same user signs in again', async () => {
		signIn();
		store.initProfile();
		await vi.waitFor(() => expect(store.profile.status).toBe('ready'));

		signIn();
		await Promise.resolve();

		expect(api.getProfile).toHaveBeenCalledTimes(1);
	});

	it('reloads on refresh', async () => {
		signIn();
		store.initProfile();
		await vi.waitFor(() => expect(store.profile.status).toBe('ready'));
		api.getProfile.mockResolvedValue({ ...rogue, bio: 'new bio' });

		await store.refreshProfile();

		expect(store.profile.data?.bio).toBe('new bio');
	});

	describe('saving', () => {
		const input = { username: 'rogue.serenity', discoverable: true };

		it('creates the profile when there is none yet', async () => {
			api.getProfile.mockRejectedValue(notFound());
			api.createProfile.mockResolvedValue(rogue);
			signIn();
			store.initProfile();
			await vi.waitFor(() => expect(store.profile.status).toBe('none'));

			expect(await store.saveProfile(input)).toEqual(rogue);

			expect(api.createProfile).toHaveBeenCalledWith({ identifier: 'user-1', profileInput: input });
			expect(api.updateProfile).not.toHaveBeenCalled();
			expect(store.profile.status).toBe('ready');
		});

		it('updates the profile when one exists', async () => {
			api.updateProfile.mockResolvedValue({ ...rogue, bio: 'saved' });
			signIn();
			store.initProfile();
			await vi.waitFor(() => expect(store.profile.status).toBe('ready'));

			await store.saveProfile(input);

			expect(api.updateProfile).toHaveBeenCalledWith({ identifier: 'user-1', profileInput: input });
			expect(store.profile.data?.bio).toBe('saved');
		});

		it('refuses to save while signed out', async () => {
			await expect(store.saveProfile(input)).rejects.toThrow('Not signed in');
		});
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profilesApi } from '#lib/api/client.js';
import { signOut } from '#lib/auth/auth.svelte.js';
import { deleteAccount } from './delete-account.js';

vi.mock('#lib/api/client.js', () => ({ profilesApi: { deleteProfile: vi.fn() } }));
vi.mock('#lib/auth/auth.svelte.js', () => ({ signOut: vi.fn() }));

beforeEach(() => {
	vi.mocked(profilesApi.deleteProfile).mockReset().mockResolvedValue(undefined);
	vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
});

describe('deleteAccount', () => {
	it("deletes the caller's own profile by user id, then signs out", async () => {
		await deleteAccount('user-1');

		expect(profilesApi.deleteProfile).toHaveBeenCalledWith({ identifier: 'user-1' });
		expect(vi.mocked(signOut).mock.invocationCallOrder[0]).toBeGreaterThan(
			vi.mocked(profilesApi.deleteProfile).mock.invocationCallOrder[0]
		);
	});

	it('stays signed in when the delete fails, so it can be retried', async () => {
		vi.mocked(profilesApi.deleteProfile).mockRejectedValue(new Error('network'));

		await expect(deleteAccount('user-1')).rejects.toThrow('network');

		expect(signOut).not.toHaveBeenCalled();
	});
});

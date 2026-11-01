import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Profile } from '@roguekeyboards/mykeebs-api-client';
import { ResponseError } from '@roguekeyboards/mykeebs-api-client';
import { profilesApi } from '#lib/api/client.js';
import { deferred, settled } from '#lib/components/test-support/deferred.js';
import { goTo } from '#lib/test-support/app-page.svelte.js';
import RootWithProfile from './test-support/RootWithProfile.svelte';

vi.mock('$app/state', async () => {
	const { appPage } = await import('#lib/test-support/app-page.svelte.js');
	return { page: appPage };
});
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('#lib/auth/auth.svelte.js', () => ({
	initAuth: vi.fn(async () => {}),
	dismissSignInFailure: vi.fn(),
	signIn: vi.fn(),
	signOut: vi.fn(),
	auth: { status: 'signed-out', user: null, signInFailed: false }
}));
vi.mock('#lib/profile/profile.svelte.js', () => ({
	initProfile: vi.fn(),
	profile: { status: 'ready', data: { username: 'jay' } }
}));
vi.mock('#lib/api/client.js', () => ({
	profilesApi: { getProfile: vi.fn(), listProfiles: vi.fn() }
}));

const getProfile = vi.mocked(profilesApi.getProfile);

function profileOf(username: string): Profile {
	return { userId: `id-${username}`, username, discoverable: true };
}

const current = (nav: string, name: string) =>
	page.getByRole('navigation', { name }).getByRole('link', { name: nav, exact: true });

async function expectCurrent(navName: string, expected: string[], all: string[]) {
	for (const name of all) {
		const link = current(name, navName);
		if (expected.includes(name)) await expect.element(link).toHaveAttribute('aria-current', 'page');
		else await expect.element(link).not.toHaveAttribute('aria-current');
	}
}

const TABS = ['Overview', 'Keyboards', 'Switches', 'Keycap Sets', 'Builds'];

beforeEach(() => {
	getProfile.mockReset();
	getProfile.mockImplementation(async ({ identifier }) => profileOf(identifier));
});

describe('site navigation', () => {
	describe('on a wide screen', () => {
		beforeEach(async () => {
			await page.viewport(1024, 768);
		});
		afterEach(async () => {
			await page.viewport(414, 896);
		});

		it.each([
			['/u/jay', 'Overview'],
			['/u/jay/keyboards', 'Keyboards'],
			['/u/jay/switches', 'Switches'],
			['/u/jay/keycap-sets', 'Keycap Sets'],
			['/u/jay/builds', 'Builds'],
			['/u/jay/builds/kb-1', 'Builds']
		])('at %s marks My Collection and the %s tab', async (pathname, tab) => {
			goTo(pathname);

			await render(RootWithProfile);

			await expect
				.element(current('My Collection', 'Main'))
				.toHaveAttribute('aria-current', 'page');
			await expect
				.element(current('My Collection', 'Main'))
				.toHaveAttribute('href', '/u/jay/keyboards');
			await expectCurrent('Profile', [tab], TABS);
		});

		it("doesn't mark My Collection on another builder's profile", async () => {
			goTo('/u/jay2/keyboards', 'jay2');

			await render(RootWithProfile);

			await expect.element(current('Keyboards', 'Profile')).toHaveAttribute('aria-current', 'page');
			await expect.element(current('My Collection', 'Main')).not.toHaveAttribute('aria-current');
		});
	});

	it('marks the Builds tab under a keyboard in the mobile menu too', async () => {
		goTo('/u/jay/builds/kb-1');
		await render(RootWithProfile);
		await expect.element(page.getByText('@jay')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Open menu' }).click();

		await expectCurrent('Profile', ['Builds'], TABS);
		await expect.element(current('My Collection', 'Main')).toHaveAttribute('aria-current', 'page');
	});
});

describe('moving between profiles', () => {
	it("doesn't let a slow response for the last profile replace the current one", async () => {
		const slow = deferred<Profile>();
		getProfile.mockImplementationOnce(() => slow.promise);
		goTo('/u/a', 'a');
		await render(RootWithProfile);
		await vi.waitFor(() => expect(getProfile).toHaveBeenCalledOnce());

		goTo('/u/b', 'b');
		await expect.element(page.getByRole('heading', { name: '@b' })).toBeInTheDocument();

		slow.resolve(profileOf('a'));
		await settled();

		await expect.element(page.getByRole('heading', { name: '@b' })).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: '@a' })).not.toBeInTheDocument();
	});

	it("doesn't let a slow failure for the last profile replace the current one", async () => {
		let failSlow!: (reason: unknown) => void;
		getProfile.mockImplementationOnce(() => new Promise((_, reject) => (failSlow = reject)));
		goTo('/u/a', 'a');
		await render(RootWithProfile);
		await vi.waitFor(() => expect(getProfile).toHaveBeenCalledOnce());

		goTo('/u/b', 'b');
		await expect.element(page.getByRole('heading', { name: '@b' })).toBeInTheDocument();

		failSlow(new ResponseError(new Response(null, { status: 404 })));
		await settled();

		await expect.element(page.getByRole('heading', { name: '@b' })).toBeInTheDocument();
		await expect.element(page.getByText('No one here.')).not.toBeInTheDocument();
	});
});

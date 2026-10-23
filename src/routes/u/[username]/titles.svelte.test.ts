import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { ResponseError } from '@rogueserenity/kbdb-api-client';
import { profilesApi } from '#lib/api/client.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import UserLayout from './+layout.svelte';
import OverviewPage from './+page.svelte';
import KeyboardsPage from './keyboards/+page.svelte';
import SwitchesPage from './switches/+page.svelte';
import KeycapSetsPage from './keycap-sets/+page.svelte';
import BuildsPage from './builds/+page.svelte';
import KeyboardBuildsPage from './builds/[keyboardId]/+page.svelte';

vi.mock('$app/state', () => ({
	page: {
		params: { username: 'rogue.serenity', keyboardId: 'kb-1' },
		url: new URL('http://localhost/u/rogue.serenity')
	}
}));
vi.mock('#lib/auth/auth.svelte.js', () => ({
	auth: { status: 'signed-in', user: { id: 'user-1', email: null } }
}));
vi.mock('#lib/api/client.js', () => {
	const empty = async () => ({ items: [] });
	return {
		profilesApi: { getProfile: vi.fn() },
		keyboardsApi: {
			listKeyboards: empty,
			getKeyboard: async () => ({ id: 'kb-1', brand: 'Qwertykeys', name: 'Neo65 Cu' })
		},
		switchesApi: { listSwitches: empty },
		keycapSetsApi: { listKeycapSets: empty },
		buildsApi: { listBuilds: empty },
		lookupsApi: { getLookup: async () => ({ values: [] }) }
	};
});

const title = (expected: string) => vi.waitFor(() => expect(document.title).toBe(expected));

describe('user page titles', () => {
	it.each([
		['the overview', OverviewPage, '@rogue.serenity · mykeebs'],
		['keyboards', KeyboardsPage, 'Keyboards · @rogue.serenity · mykeebs'],
		['switches', SwitchesPage, 'Switches · @rogue.serenity · mykeebs'],
		['keycap sets', KeycapSetsPage, 'Keycap sets · @rogue.serenity · mykeebs'],
		['builds', BuildsPage, 'Builds · @rogue.serenity · mykeebs']
	])('titles %s', async (_, component, expected) => {
		await render(WithUserContext, { component });

		await title(expected);
	});

	it("titles a keyboard's builds with the keyboard's name", async () => {
		await render(WithUserContext, { component: KeyboardBuildsPage });

		await title('Neo65 Cu builds · @rogue.serenity · mykeebs');
	});
});

describe('user layout titles', () => {
	const children = createRawSnippet(() => ({ render: () => '<div></div>' }));

	it('titles the tab with the username while the profile loads', async () => {
		vi.mocked(profilesApi.getProfile).mockReturnValue(new Promise(() => {}));

		await render(UserLayout, { children });

		await title('@rogue.serenity · mykeebs');
	});

	it('titles the tab as not found when there is no such profile', async () => {
		vi.mocked(profilesApi.getProfile).mockRejectedValue(
			new ResponseError(new Response(null, { status: 404 }))
		);

		await render(UserLayout, { children });

		await title('Not found · mykeebs');
		await expect
			.element(page.getByRole('heading', { level: 1, name: 'No one here.' }))
			.toBeInTheDocument();
	});
});

describe('user layout tabs', () => {
	const children = createRawSnippet(() => ({ render: () => '<div></div>' }));

	it('names the tab strip and marks the current tab', async () => {
		vi.mocked(profilesApi.getProfile).mockResolvedValue({
			userId: 'user-1',
			username: 'rogue.serenity',
			discoverable: true
		} as never);

		await render(UserLayout, { children });

		const tabs = page.getByRole('navigation', { name: 'Profile' });
		await expect
			.element(tabs.getByRole('link', { name: 'Overview' }))
			.toHaveAttribute('aria-current', 'page');
		await expect
			.element(tabs.getByRole('link', { name: 'Keyboards' }))
			.not.toHaveAttribute('aria-current');
	});
});

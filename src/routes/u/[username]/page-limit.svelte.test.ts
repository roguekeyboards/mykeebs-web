import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildsApi, keyboardsApi, keycapSetsApi, switchesApi } from '#lib/api/client.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
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
	auth: { status: 'signed-in', user: { id: 'user-1' } }
}));
vi.mock('#lib/api/client.js', () => {
	const empty = () => vi.fn(async () => ({ items: [] }));
	return {
		profilesApi: { getProfile: vi.fn() },
		keyboardsApi: {
			listKeyboards: empty(),
			getKeyboard: async () => ({ id: 'kb-1', brand: 'Qwertykeys', name: 'Neo65 Cu' })
		},
		switchesApi: { listSwitches: empty() },
		keycapSetsApi: { listKeycapSets: empty() },
		buildsApi: { listBuilds: empty() },
		lookupsApi: { getLookup: async () => ({ values: [] }) }
	};
});

const lists = [
	keyboardsApi.listKeyboards,
	switchesApi.listSwitches,
	keycapSetsApi.listKeycapSets,
	buildsApi.listBuilds
].map((list) => vi.mocked(list));

beforeEach(() => {
	lists.forEach((list) => list.mockClear());
});

describe('collection page size', () => {
	it.each([
		['the overview', OverviewPage, 4],
		['keyboards', KeyboardsPage, 1],
		['switches', SwitchesPage, 1],
		['keycap sets', KeycapSetsPage, 1],
		['builds', BuildsPage, 1],
		["a keyboard's builds", KeyboardBuildsPage, 1]
	])("requests kbdb's largest page on %s", async (_, component, calls) => {
		await render(WithUserContext, { component });

		const made = await vi.waitFor(() => {
			const all = lists.flatMap((list) => list.mock.calls);
			expect(all).toHaveLength(calls);
			return all;
		});
		for (const [request] of made) expect(request).toMatchObject({ limit: 100 });
	});
});

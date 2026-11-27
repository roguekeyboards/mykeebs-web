import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { replaceState } from '$app/navigation';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import KeyboardsPage from './keyboards/+page.svelte';
import SwitchesPage from './switches/+page.svelte';
import ECPartsPage from './ec-parts/+page.svelte';
import KeycapSetsPage from './keycap-sets/+page.svelte';

const location = vi.hoisted(() => ({ url: new URL('http://localhost/') }));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return location.url;
		},
		state: {}
	}
}));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn() }));
vi.mock('#lib/api/client.js', () => {
	const two = <T>(make: (id: string, name: string) => T) =>
		vi.fn(async () => ({ items: [make('a', 'Alpha'), make('b', 'Bravo')] }));
	return {
		keyboardsApi: {
			listKeyboards: two((id, name) => ({ id, brand: 'Bowl', name, visibility: 'public' })),
			getKeyboard: vi.fn()
		},
		switchesApi: {
			listSwitches: two((id, name) => ({
				id,
				brand: 'HMX',
				name,
				type: 'Linear',
				visibility: 'public'
			})),
			getSwitch: vi.fn()
		},
		ecPartsApi: {
			listECParts: two((id, name) => ({
				id,
				brand: 'Omnitype',
				name,
				partType: 'sliders',
				visibility: 'public'
			})),
			getECPart: vi.fn()
		},
		keycapSetsApi: {
			listKeycapSets: two((id, name) => ({ id, brand: 'GMK', name, visibility: 'public' })),
			getKeycapSet: vi.fn()
		},
		buildsApi: { getBuild: vi.fn(), listBuilds: vi.fn(async () => ({ items: [] })) },
		lookupsApi: { getLookup: vi.fn(async () => ({ values: [] })) }
	};
});

beforeEach(() => {
	vi.mocked(replaceState).mockClear();
});

describe('a link to one item', () => {
	it.each([
		['keyboards', KeyboardsPage],
		['switches', SwitchesPage],
		['ec-parts', ECPartsPage],
		['keycap-sets', KeycapSetsPage]
	])('opens it on the %s page and drops the request from the address', async (list, component) => {
		location.url = new URL(`http://localhost/u/rogue.serenity/${list}?open=b`);

		await render(WithUserContext, { component });

		await expect.element(page.getByRole('dialog', { name: /Bravo/ })).toBeInTheDocument();
		const [url] = vi.mocked(replaceState).mock.calls[0];
		expect(String(url)).toBe(`http://localhost/u/rogue.serenity/${list}`);
	});
});

describe('sharing an item', () => {
	it.each([
		['keyboards', KeyboardsPage],
		['switches', SwitchesPage],
		['ec-parts', ECPartsPage],
		['keycap-sets', KeycapSetsPage]
	])('copies a link to it from the %s page, keeping the filters', async (list, component) => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		location.url = new URL(`http://localhost/u/rogue.serenity/${list}?q=bra`);
		await render(WithUserContext, { component });

		await page.getByRole('button', { name: /Bravo/ }).click();
		await page.getByRole('button', { name: 'Share link to Bravo' }).click();

		expect(writeText).toHaveBeenCalledWith(
			`http://localhost/u/rogue.serenity/${list}?q=bra&open=b`
		);
		await expect
			.element(page.getByRole('status').filter({ hasText: 'Link copied' }))
			.toBeInTheDocument();
	});
});

describe('a link to an item that is not there', () => {
	it('says so instead of opening nothing', async () => {
		location.url = new URL('http://localhost/u/rogue.serenity/switches?open=gone');

		await render(WithUserContext, { component: SwitchesPage });

		await expect
			.element(page.getByRole('alert').filter({ hasText: "That item isn't available" }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});

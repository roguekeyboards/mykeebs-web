import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import { page as fakePage } from '#lib/components/test-support/fake-page.svelte.js';
import OverviewPage from './+page.svelte';

vi.mock('$app/state', () => import('#lib/components/test-support/fake-page.svelte.js'));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn() }));

vi.mock('#lib/api/client.js', () => {
	const empty = async () => ({ items: [] });
	return {
		keyboardsApi: { listKeyboards: empty },
		switchesApi: {
			listSwitches: async () => ({
				items: [
					{
						id: 's',
						brand: 'HMX',
						name: 'Aperol',
						type: 'Linear',
						totalCost: 40,
						currency: 'USD'
					}
				]
			})
		},
		ecPartsApi: {
			listECParts: async () => ({
				items: [
					{
						id: 'e1',
						brand: 'Deskeys',
						name: 'Domes',
						partType: 'domes',
						orderStatus: 'Delivered',
						totalCost: 60,
						currency: 'USD'
					},
					{ id: 'e2', brand: 'Keebwerk', name: 'Sliders', partType: 'sliders' }
				]
			})
		},
		keycapSetsApi: { listKeycapSets: empty },
		buildsApi: { listBuilds: empty }
	};
});

it('counts EC parts in their own tile and in the total spent', async () => {
	await render(WithUserContext, { component: OverviewPage });

	const tile = page.getByRole('link', { name: /EC Parts/ });
	await expect.element(tile).toHaveAttribute('href', '/u/rogue.serenity/ec-parts');
	await expect.element(tile).toMatchTextContent(/EC Parts\s*2\s*\$60\.00/);
	await expect.element(page.getByText(/^Total spent:/)).toMatchTextContent('$100.00');
});

it('restores the status filter from the address', async () => {
	fakePage.url = new URL('http://localhost/u/rogue.serenity?status=delivered');
	await render(WithUserContext, { component: OverviewPage });

	await expect
		.element(page.getByRole('button', { name: 'Delivered' }))
		.toHaveAttribute('aria-pressed', 'true');
	await expect
		.element(page.getByRole('link', { name: /EC Parts/ }))
		.toMatchTextContent(/EC Parts\s*1\s/);
});

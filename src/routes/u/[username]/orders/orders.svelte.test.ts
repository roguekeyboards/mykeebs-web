import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ecPartsApi, keyboardsApi, keycapSetsApi, switchesApi } from '#lib/api/client.js';
import { quarterOptions } from '#lib/estimated-delivery.js';
import { todayDateInput } from '#lib/format.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import OrdersPage from './+page.svelte';

vi.mock('#lib/api/client.js', () => ({
	keyboardsApi: { listKeyboards: vi.fn() },
	keycapSetsApi: { listKeycapSets: vi.fn() },
	switchesApi: { listSwitches: vi.fn() },
	ecPartsApi: { listECParts: vi.fn() }
}));

const [thisQuarter, nextQuarter] = quarterOptions(todayDateInput());

beforeEach(() => {
	vi.mocked(keyboardsApi.listKeyboards).mockResolvedValue({
		items: [
			{
				id: 'kb-1',
				brand: 'Bowl',
				name: 'Deacon TKL',
				purchase: {
					orderStatus: 'Ordered',
					vendor: 'Bowl',
					price: 600,
					currency: 'USD',
					estimatedDeliveryDate: new Date(nextQuarter.value)
				}
			},
			{
				id: 'kb-2',
				brand: 'KBDFans',
				name: 'Agar',
				purchase: { orderStatus: 'Delivered', price: 125, currency: 'USD' }
			}
		]
	});
	vi.mocked(keycapSetsApi.listKeycapSets).mockResolvedValue({
		items: [
			{
				id: 'set-1',
				brand: 'GMK',
				available: false,
				name: 'Olivia',
				kits: [
					{
						kitId: 'base',
						name: 'Base',
						purchase: {
							orderStatus: 'Shipped',
							price: 140,
							currency: 'USD',
							estimatedDeliveryDate: new Date(thisQuarter.value)
						}
					}
				]
			}
		]
	});
	vi.mocked(switchesApi.listSwitches).mockResolvedValue({
		items: [
			{
				id: 'sw-1',
				brand: 'HMX',
				availableQuantity: 0,
				name: 'Aperol',
				type: 'Linear',
				purchases: [{ orderStatus: 'Ordered', quantity: 90, price: 30, currency: 'USD' }]
			}
		]
	});
	vi.mocked(ecPartsApi.listECParts).mockResolvedValue({ items: [] });
});

const section = (title: string) => page.getByRole('region', { name: title });

describe('orders page', () => {
	it('groups everything awaiting delivery by the quarter it is expected', async () => {
		await render(WithUserContext, { component: OrdersPage });

		await expect
			.element(section(thisQuarter.label).getByRole('link', { name: /GMK Olivia/ }))
			.toHaveAttribute('href', '/u/rogue.serenity/keycap-sets?open=set-1');
		await expect.element(section(thisQuarter.label).getByText('this quarter')).toBeInTheDocument();
		await expect
			.element(section(nextQuarter.label).getByRole('link', { name: /Deacon TKL/ }))
			.toHaveAttribute('href', '/u/rogue.serenity/keyboards?open=kb-1');
		await expect
			.element(section('No estimate').getByRole('link', { name: /HMX Aperol/ }))
			.toHaveAttribute('href', '/u/rogue.serenity/switches?open=sw-1');
		await expect.element(page.getByText('Agar')).not.toBeInTheDocument();
	});

	it('counts and totals the orders', async () => {
		await render(WithUserContext, { component: OrdersPage });

		await expect.element(page.getByText('$770.00')).toBeInTheDocument();
		await expect
			.element(section(nextQuarter.label).getByText('1 order · $600.00'))
			.toBeInTheDocument();
	});

	it('shows nothing to anyone but the owner', async () => {
		await render(WithUserContext, { component: OrdersPage, isOwnProfile: false });

		await expect
			.element(page.getByText('Only the owner can see their orders.'))
			.toBeInTheDocument();
		expect(keyboardsApi.listKeyboards).not.toHaveBeenCalled();
	});

	it('says so when nothing is on order', async () => {
		vi.mocked(keyboardsApi.listKeyboards).mockResolvedValue({ items: [] });
		vi.mocked(keycapSetsApi.listKeycapSets).mockResolvedValue({ items: [] });
		vi.mocked(switchesApi.listSwitches).mockResolvedValue({ items: [] });

		await render(WithUserContext, { component: OrdersPage });

		await expect.element(page.getByText('Nothing on order.')).toBeInTheDocument();
	});
});

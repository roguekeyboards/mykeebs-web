import { describe, expect, it } from 'vitest';
import type { Keyboard, KeycapSet, Switch } from '@roguekeyboards/kbdb-api-client';
import { collectionStats, countsFor, totalsFor } from './collection-stats';

function sw(purchase: Switch['purchase']): Switch {
	return { id: 's', brand: 'HMX', name: 'Aperol', type: 'Linear', purchase };
}

function kb(id: string, fields: Pick<Keyboard, 'purchase' | 'totalCost' | 'currency'>): Keyboard {
	return { id, brand: 'Mode', name: 'Sonnet', ...fields };
}

function set(purchase: Pick<KeycapSet, 'orderStatus' | 'totalCost' | 'currency'>): KeycapSet {
	return { id: 'c', brand: 'GMK', name: 'Olivia', ...purchase };
}

const empty = { keyboards: [], switches: [], keycapSets: [], builds: [] };

describe('collectionStats', () => {
	it('reads a switch status and price from its purchase', () => {
		const stats = collectionStats({
			...empty,
			switches: [sw({ orderStatus: 'Delivered', price: 31.5, currency: 'USD' })]
		});
		expect(stats.switches).toEqual([{ status: 'Delivered', price: 31.5 }]);
	});

	it('reads a keyboard price from its total cost, parts included', () => {
		const stats = collectionStats({
			...empty,
			keyboards: [
				kb('k', {
					purchase: { orderStatus: 'Delivered', price: 300, currency: 'USD' },
					totalCost: 420,
					currency: 'USD'
				})
			]
		});
		expect(stats.keyboards).toEqual([{ status: 'Delivered', price: 420 }]);
	});

	it("takes a keyboard's currency from its total cost, even with no base price", () => {
		const stats = collectionStats({
			...empty,
			keyboards: [
				kb('k', { purchase: { orderStatus: 'Delivered' }, totalCost: 120, currency: 'GBP' })
			]
		});
		expect(stats.currency).toBe('GBP');
	});

	it('takes the currency from whichever item carries a price', () => {
		const stats = collectionStats({
			...empty,
			keyboards: [kb('k', { purchase: { orderStatus: 'Delivered' } })],
			switches: [sw({ price: 20, currency: 'EUR' })]
		});
		expect(stats.currency).toBe('EUR');
	});

	it('has no currency when kbdb withheld every price', () => {
		const stats = collectionStats({
			...empty,
			keyboards: [kb('k', { purchase: { orderStatus: 'Delivered' } })],
			switches: [sw({ orderStatus: 'Delivered' })],
			builds: [{ id: 'b', keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' } }]
		});
		expect(stats.currency).toBeUndefined();
	});
});

describe('countsFor and totalsFor', () => {
	const stats = collectionStats({
		keyboards: [
			kb('k1', { purchase: { orderStatus: 'Delivered' }, totalCost: 100, currency: 'USD' }),
			kb('k2', { purchase: { orderStatus: 'Ordered' }, totalCost: 50, currency: 'USD' })
		],
		switches: [
			sw({ orderStatus: 'Delivered', price: 30, currency: 'USD' }),
			sw({ orderStatus: 'Shipped', price: 20, currency: 'USD' })
		],
		keycapSets: [set({ orderStatus: 'Delivered', totalCost: 120, currency: 'USD' })],
		builds: [
			{
				id: 'b',
				keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
				totalCost: 400,
				currency: 'USD'
			}
		]
	});

	it('counts and sums everything under all', () => {
		expect(countsFor(stats, 'all')).toEqual({
			keyboards: 2,
			switches: 2,
			keycapSets: 1,
			builds: 1
		});
		expect(totalsFor(stats, 'all')).toEqual({
			keyboards: 150,
			switches: 50,
			keycapSets: 120,
			builds: 400
		});
	});

	it('narrows counts and totals to the filtered status, ignoring case', () => {
		expect(countsFor(stats, 'delivered')).toEqual({
			keyboards: 1,
			switches: 1,
			keycapSets: 1,
			builds: 0
		});
		expect(totalsFor(stats, 'delivered')).toEqual({
			keyboards: 100,
			switches: 30,
			keycapSets: 120,
			builds: 0
		});
	});
});

import { describe, expect, it } from 'vitest';
import { ECPartType, type Keyboard } from '@roguekeyboards/mykeebs-api-client';
import { isLate, ordersAwaitingDelivery, sectionsByQuarter, type Order } from './order-tracker';

const empty = { keyboards: [], keycapSets: [], switches: [], ecParts: [] };

const keyboard: Keyboard = {
	id: 'kb-1',
	brand: 'Bowl',
	name: 'Deacon TKL',
	size: 'TKL',
	purchase: { orderStatus: 'Ordered', price: 600, currency: 'USD' },
	plates: [
		{ id: 'p-1', material: 'POM', purchase: { orderStatus: 'Shipped' } },
		{ id: 'p-2', material: 'FR4', purchase: { orderStatus: 'Delivered' } }
	],
	pcbs: [
		{ id: 'c-1', assembly: 'Hotswap', connectivity: 'Wired', purchase: { orderStatus: 'Planned' } }
	]
};

function order(name: string, estimate?: string, orderDate?: string, price?: number): Order {
	return {
		key: name,
		kind: 'keyboard',
		itemId: name,
		name,
		detail: undefined,
		statuses: ['Ordered'],
		purchase: {
			orderStatus: 'Ordered',
			estimatedDeliveryDate: estimate ? new Date(estimate) : undefined,
			orderDate: orderDate ? new Date(orderDate) : undefined,
			price,
			currency: price === undefined ? undefined : 'USD'
		}
	};
}

describe('ordersAwaitingDelivery', () => {
	it("lists a keyboard's own purchase and its parts', skipping ones not awaiting delivery", () => {
		const orders = ordersAwaitingDelivery({ ...empty, keyboards: [keyboard] });

		expect(orders.map((o) => [o.kind, o.itemId, o.name, o.detail])).toEqual([
			['keyboard', 'kb-1', 'Deacon TKL', 'Bowl · TKL'],
			['plate', 'kb-1', 'Deacon TKL', 'Plate 1 · POM']
		]);
	});

	describe('parts ordered with the board', () => {
		const ordered = { vendor: 'Bowl', orderDate: new Date('2026-05-01'), currency: 'USD' };
		const withParts = (boardStatus: string): Keyboard => ({
			id: 'kb-1',
			brand: 'Bowl',
			name: 'Deacon TKL',
			purchase: { ...ordered, orderStatus: boardStatus, price: 600 },
			plates: [
				{
					id: 'p-1',
					material: 'POM',
					purchase: { ...ordered, vendor: ' bowl ', orderStatus: 'Ordered', price: 40 }
				},
				{
					id: 'p-2',
					material: 'FR4',
					purchase: { ...ordered, orderDate: new Date('2026-06-01'), orderStatus: 'Ordered' }
				}
			],
			pcbs: [
				{
					id: 'c-1',
					assembly: 'Hotswap',
					connectivity: 'Wired',
					purchase: { ...ordered, orderStatus: 'Shipped', price: 60 }
				}
			]
		});

		it('leaves them out, counting their price in the board', () => {
			const orders = ordersAwaitingDelivery({ ...empty, keyboards: [withParts('Ordered')] });

			expect(orders.map((o) => [o.kind, o.detail, o.purchase.price])).toEqual([
				['keyboard', 'Bowl', 700],
				['plate', 'Plate 2 · FR4', undefined]
			]);
		});

		it("leaves a part that already arrived out of the board's price", () => {
			const keyboard = withParts('Ordered');
			keyboard.plates![0].purchase!.orderStatus = 'Delivered';

			const [board] = ordersAwaitingDelivery({ ...empty, keyboards: [keyboard] });

			expect(board.purchase.price).toBe(660);
		});

		it("prices an unpriced board's row by its parts, in their currency", () => {
			const keyboard = withParts('Ordered');
			keyboard.purchase = { vendor: 'Bowl', orderDate: ordered.orderDate, orderStatus: 'Ordered' };

			const [board] = ordersAwaitingDelivery({ ...empty, keyboards: [keyboard] });

			expect([board.purchase.price, board.purchase.currency]).toEqual([100, 'USD']);
		});

		it('lists them once the board has arrived without them', () => {
			const orders = ordersAwaitingDelivery({ ...empty, keyboards: [withParts('Delivered')] });

			expect(orders.map((o) => o.detail)).toEqual([
				'Plate 1 · POM',
				'Plate 2 · FR4',
				'PCB 1 · Hotswap'
			]);
		});
	});

	it('lists each keycap kit and each switch or EC part purchase on its own', () => {
		const orders = ordersAwaitingDelivery({
			...empty,
			keycapSets: [
				{
					id: 'set-1',
					brand: 'GMK',
					name: 'Olivia',
					kits: [
						{ kitId: 'base', name: 'Base', purchase: { orderStatus: 'Ordered' } },
						{ kitId: 'nov', name: 'Novelties' }
					]
				}
			],
			switches: [
				{
					id: 'sw-1',
					brand: 'HMX',
					name: 'Aperol',
					type: 'Linear',
					purchases: [
						{ orderStatus: 'Delivered', quantity: 70 },
						{ orderStatus: 'Ordered', quantity: 90 }
					]
				}
			],
			ecParts: [
				{
					id: 'ec-1',
					brand: 'Omnitype',
					name: 'DynaPak',
					partType: ECPartType.Sliders,
					purchases: [{ orderStatus: 'Shipped', quantity: 70 }]
				}
			]
		});

		expect(orders.map((o) => [o.kind, o.itemId, o.name, o.detail])).toEqual([
			['keycaps', 'set-1', 'GMK Olivia', 'Kit: Base'],
			['switches', 'sw-1', 'HMX Aperol', '90 switches'],
			['ec-parts', 'ec-1', 'Omnitype DynaPak', 'Sliders · 70 pieces']
		]);
		expect(new Set(orders.map((o) => o.key)).size).toBe(3);
	});
});

describe('sectionsByQuarter', () => {
	const today = '2026-11-25';

	it('puts overdue first, then each quarter in order, then those with no estimate', () => {
		const sections = sectionsByQuarter(
			[
				order('none'),
				order('q1', '2027-03-31'),
				order('late', '2026-09-30'),
				order('q4', '2026-12-31'),
				order('q1-exact', '2027-02-14')
			],
			today
		);

		expect(sections.map((s) => [s.title, s.tone, s.current, s.orders.map((o) => o.name)])).toEqual([
			['Overdue', 'overdue', false, ['late']],
			['Q4 2026', 'quarter', true, ['q4']],
			['Q1 2027', 'quarter', false, ['q1-exact', 'q1']],
			['No estimate', 'unestimated', false, ['none']]
		]);
	});

	it('orders a section by estimate, then order date, then name', () => {
		const [section] = sectionsByQuarter(
			[
				order('b', '2027-03-31', '2026-05-01'),
				order('c', '2027-03-31'),
				order('a', '2027-03-31', '2026-05-01'),
				order('first', '2027-03-31', '2026-01-01')
			],
			today
		);

		expect(section.orders.map((o) => o.name)).toEqual(['first', 'a', 'b', 'c']);
	});

	it('totals each section, leaving the total out when no price is shown', () => {
		const [priced, unpriced] = sectionsByQuarter(
			[
				order('a', '2026-12-31', undefined, 100),
				order('b', '2026-12-31', undefined, 25.5),
				order('c')
			],
			today
		);

		expect([priced.total, priced.currency]).toEqual([125.5, 'USD']);
		expect(unpriced.total).toBeUndefined();
	});

	it("groups a keycap set's kits in the same section into one entry", () => {
		const kit = (name: string, purchase: Order['purchase']) =>
			ordersAwaitingDelivery({
				...empty,
				keycapSets: [
					{ id: 'set-1', brand: 'GMK', name: 'Olivia', kits: [{ kitId: name, name, purchase }] }
				]
			});
		const orders = [
			...kit('Base', {
				orderStatus: 'Ordered',
				vendor: 'NovelKeys',
				price: 140,
				currency: 'USD',
				orderDate: new Date('2026-05-01'),
				estimatedDeliveryDate: new Date('2027-03-31')
			}),
			...kit('Novelties', {
				orderStatus: 'Shipped',
				vendor: 'NovelKeys',
				price: 45,
				currency: 'USD',
				orderDate: new Date('2026-04-01'),
				estimatedDeliveryDate: new Date('2027-02-14')
			}),
			...kit('Spacebars', { orderStatus: 'Ordered', vendor: 'Dixie Mech' })
		];

		const [q1, none] = sectionsByQuarter(orders, today);

		expect(q1.orders).toEqual([
			expect.objectContaining({
				name: 'GMK Olivia',
				detail: 'Kits: Base, Novelties',
				statuses: ['Ordered', 'Shipped'],
				purchase: {
					vendor: 'NovelKeys',
					price: 185,
					currency: 'USD',
					orderDate: new Date('2026-04-01'),
					estimatedDeliveryDate: new Date('2027-02-14')
				}
			})
		]);
		expect(none.orders.map((o) => o.detail)).toEqual(['Kit: Spacebars']);
	});

	it('leaves out sections with nothing in them', () => {
		expect(sectionsByQuarter([], today)).toEqual([]);
	});
});

describe('isLate', () => {
	it('is true once the estimate has passed', () => {
		expect(isLate(order('a', '2026-11-24'), '2026-11-25')).toBe(true);
		expect(isLate(order('a', '2026-11-25'), '2026-11-25')).toBe(false);
		expect(isLate(order('a'), '2026-11-25')).toBe(false);
	});
});

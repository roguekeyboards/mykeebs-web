import { describe, expect, it } from 'vitest';
import type { PurchaseLike } from '#lib/format.js';
import {
	bulkPurchaseDateError,
	bulkPurchaseDraft,
	bulkPurchaseDrafts,
	bulkPurchaseInputs,
	bulkPurchasesSummary,
	earliestDate
} from './purchases.js';

const of = (...purchases: PurchaseLike[]) => ({ purchases });

describe('earliestDate', () => {
	const jan = new Date('2026-01-05');
	const mar = new Date('2026-03-01');

	it('is the earliest date among purchases that are not cancelled', () => {
		expect(
			earliestDate(
				of({ orderDate: mar }, { orderDate: jan, orderStatus: 'Cancelled' }, {}),
				'orderDate'
			)
		).toBe(mar.getTime());
	});

	it('falls back to cancelled purchases when every purchase is', () => {
		expect(earliestDate(of({ deliveryDate: jan, orderStatus: 'Cancelled' }), 'deliveryDate')).toBe(
			jan.getTime()
		);
	});

	it('only counts estimates on purchases still awaiting delivery', () => {
		const items = of(
			{ estimatedDeliveryDate: jan, orderStatus: 'Delivered' },
			{ estimatedDeliveryDate: jan, orderStatus: 'Cancelled' },
			{ estimatedDeliveryDate: mar, orderStatus: 'Shipped' }
		);
		expect(earliestDate(items, 'estimatedDeliveryDate')).toBe(mar.getTime());
		expect(
			earliestDate(
				of({ estimatedDeliveryDate: jan, orderStatus: 'Delivered' }),
				'estimatedDeliveryDate'
			)
		).toBeUndefined();
	});
});

describe('bulkPurchaseDateError', () => {
	const draft = (deliveryDate: string) => ({
		...bulkPurchaseDraft(),
		orderDate: '2026-03-01',
		deliveryDate
	});

	it('names which purchase is wrong when there are several', () => {
		expect(bulkPurchaseDateError([draft('2026-04-01'), draft('2026-02-01')])).toBe(
			"Purchase 2: Delivery date can't be before the order date."
		);
	});

	it('leaves the number off a single purchase, and is undefined when all are fine', () => {
		expect(bulkPurchaseDateError([draft('2026-02-01')])).toBe(
			"Delivery date can't be before the order date."
		);
		expect(bulkPurchaseDateError([draft('2026-04-01')])).toBeUndefined();
	});
});

describe('drafts', () => {
	it('starts an item with no purchases on one blank draft', () => {
		const drafts = bulkPurchaseDrafts(undefined);
		expect(drafts).toHaveLength(1);
		expect(bulkPurchaseInputs(drafts)).toEqual([]);
	});

	it('gives every draft its own key', () => {
		const [a, b] = bulkPurchaseDrafts([{ vendor: 'A' }, { vendor: 'B' }]);
		expect(a.key).not.toBe(b.key);
	});

	it('round-trips purchases, dropping blank drafts and keeping quantity-only ones', () => {
		const purchase = {
			vendor: 'NovelKeys',
			price: 30,
			quantity: 70,
			orderDate: new Date('2026-02-01'),
			deliveryDate: new Date('2026-03-10'),
			orderStatus: 'Delivered'
		};
		const drafts = [
			...bulkPurchaseDrafts([purchase]),
			bulkPurchaseDraft(),
			{ ...bulkPurchaseDraft(), quantity: 20 }
		];

		expect(bulkPurchaseInputs(drafts)).toEqual([
			purchase,
			{
				vendor: undefined,
				price: undefined,
				orderDate: undefined,
				deliveryDate: undefined,
				orderStatus: undefined,
				quantity: 20
			}
		]);
	});

	it('summarizes one purchase by its vendor and status, and several by count', () => {
		const one = bulkPurchaseDrafts([{ vendor: 'NovelKeys', orderStatus: 'Ordered' }]);
		expect(bulkPurchasesSummary([...one, bulkPurchaseDraft()])).toBe('NovelKeys · Ordered');
		expect(bulkPurchasesSummary(bulkPurchaseDrafts([{ vendor: 'A' }, { quantity: 5 }]))).toBe(
			'2 purchases'
		);
		expect(bulkPurchasesSummary([bulkPurchaseDraft()])).toBeUndefined();
	});
});

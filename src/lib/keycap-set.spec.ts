import { describe, expect, it } from 'vitest';
import type { KeycapKit, KeycapSet } from '@rogueserenity/kbdb-api-client';
import { adjacentKitId, earliestKitDate, primaryKitImageUrl } from './keycap-set';

function kit(kitId: string, url?: string): KeycapKit {
	return { kitId, name: kitId, image: url ? { url } : undefined };
}

function set(primaryKitId: string | undefined, kits?: KeycapKit[]): KeycapSet {
	return { id: 's', brand: 'GMK', name: 'Olivia', primaryKitId, kits };
}

describe('primaryKitImageUrl', () => {
	it("returns the primary kit's image, not the first kit's", () => {
		expect(primaryKitImageUrl(set('base', [kit('novelties', 'n.png'), kit('base', 'b.png')]))).toBe(
			'b.png'
		);
	});

	it('is undefined when no primary kit is set', () => {
		expect(primaryKitImageUrl(set(undefined, [kit('base', 'b.png')]))).toBeUndefined();
	});

	it('is undefined when the primary kit no longer exists', () => {
		expect(primaryKitImageUrl(set('deleted', [kit('base', 'b.png')]))).toBeUndefined();
	});

	it('is undefined when the primary kit has no image', () => {
		expect(primaryKitImageUrl(set('base', [kit('base')]))).toBeUndefined();
	});

	it('is undefined when the set has no kits', () => {
		expect(primaryKitImageUrl(set('base'))).toBeUndefined();
	});
});

describe('adjacentKitId', () => {
	const three = set(undefined, [kit('base'), kit('novs'), kit('alphas')]);

	it('steps forward and back through the kits', () => {
		expect(adjacentKitId(three, 'base', 1)).toBe('novs');
		expect(adjacentKitId(three, 'novs', -1)).toBe('base');
	});

	it('wraps around at either end', () => {
		expect(adjacentKitId(three, 'alphas', 1)).toBe('base');
		expect(adjacentKitId(three, 'base', -1)).toBe('alphas');
	});

	it('has nowhere to go with fewer than two kits or an unknown kit', () => {
		expect(adjacentKitId(set(undefined, [kit('base')]), 'base', 1)).toBeNull();
		expect(adjacentKitId(set(undefined, undefined), 'base', 1)).toBeNull();
		expect(adjacentKitId(three, 'gone', 1)).toBeNull();
	});
});

describe('earliestKitDate', () => {
	const dated = (
		kitId: string,
		orderDate?: string,
		deliveryDate?: string,
		orderStatus?: string
	): KeycapKit => ({
		kitId,
		name: kitId,
		purchase: {
			orderStatus,
			orderDate: orderDate ? new Date(orderDate) : undefined,
			deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined
		}
	});

	it("returns the earliest of the kits' dates", () => {
		const olivia = set(undefined, [
			dated('novs', '2024-03-01', '2025-02-01'),
			dated('base', '2024-01-15', '2025-06-01'),
			dated('alphas')
		]);
		expect(earliestKitDate(olivia, 'orderDate')).toBe(new Date('2024-01-15').getTime());
		expect(earliestKitDate(olivia, 'deliveryDate')).toBe(new Date('2025-02-01').getTime());
	});

	it('ignores cancelled kits', () => {
		const olivia = set(undefined, [
			dated('base', '2024-06-01', undefined, 'Ordered'),
			dated('novs', '2023-01-01', undefined, 'Cancelled')
		]);
		expect(earliestKitDate(olivia, 'orderDate')).toBe(new Date('2024-06-01').getTime());
	});

	it('uses cancelled kits when every kit is cancelled', () => {
		const olivia = set(undefined, [
			dated('base', '2024-06-01', undefined, 'Cancelled'),
			dated('novs', '2023-01-01', undefined, 'Cancelled')
		]);
		expect(earliestKitDate(olivia, 'orderDate')).toBe(new Date('2023-01-01').getTime());
	});

	it('is undefined when no kit has the date', () => {
		expect(
			earliestKitDate(set(undefined, [kit('base'), dated('novs')]), 'orderDate')
		).toBeUndefined();
		expect(earliestKitDate(set(undefined), 'deliveryDate')).toBeUndefined();
	});
});

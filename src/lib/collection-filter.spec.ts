import { describe, expect, it } from 'vitest';
import { compareValues, filterByStatus, searchItems, sortItems } from './collection-filter';

type Item = {
	id: string;
	name: string;
	brand?: string;
	price?: number;
	status?: string;
	purchase?: { vendor?: string; orderDate?: Date };
	date?: Date;
};

const manta: Item = {
	id: 'manta-id',
	name: 'Manta',
	brand: 'Bowl',
	price: 450,
	status: 'Delivered',
	purchase: { vendor: 'NovelKeys' }
};
const agar: Item = { id: 'agar-id', name: 'Agar', brand: 'KBDFans', price: 125, status: 'ordered' };
const kafka: Item = { id: 'kafka-id', name: 'Kafka', brand: 'Typeface' };

const names = (items: Item[]) => items.map((item) => item.name);

describe('filterByStatus', () => {
	const status = (item: Item) => item.status;

	it('keeps everything for "all"', () => {
		expect(filterByStatus([manta, agar, kafka], 'all', status)).toHaveLength(3);
	});

	it("keeps only items whose status matches, regardless of the status's case", () => {
		expect(names(filterByStatus([manta, agar, kafka], 'delivered', status))).toEqual(['Manta']);
		expect(names(filterByStatus([manta, agar, kafka], 'ordered', status))).toEqual(['Agar']);
	});

	it('keeps everything when items have no status to filter on', () => {
		expect(filterByStatus([manta, agar], 'delivered', undefined)).toHaveLength(2);
	});
});

describe('searchItems', () => {
	it('matches any text field, ignoring case and surrounding space', () => {
		expect(names(searchItems([manta, agar, kafka], '  bOwL '))).toEqual(['Manta']);
	});

	it('matches text one level down, such as a purchase vendor', () => {
		expect(names(searchItems([manta, agar], 'novel'))).toEqual(['Manta']);
	});

	it('does not match on ids, numbers or dates', () => {
		const dated = {
			...kafka,
			date: new Date('2026-01-01'),
			purchase: { orderDate: new Date('2026-01-01') }
		};

		expect(searchItems([manta, agar], 'id')).toEqual([]);
		expect(searchItems([manta, agar], '450')).toEqual([]);
		expect(searchItems([dated], '2026')).toEqual([]);
	});

	it('keeps everything for an empty search', () => {
		expect(searchItems([manta, agar], '   ')).toHaveLength(2);
	});
});

describe('compareValues', () => {
	it('compares numbers numerically and text alphabetically', () => {
		expect(compareValues(9, 10)).toBeLessThan(0);
		expect(compareValues('apple', 'Banana')).toBeLessThan(0);
	});

	it('puts missing values after present ones', () => {
		expect(compareValues(undefined, 1)).toBeGreaterThan(0);
		expect(compareValues('a', undefined)).toBeLessThan(0);
		expect(compareValues(undefined, undefined)).toBe(0);
	});
});

describe('sortItems', () => {
	const byName = (item: Item) => item.name;
	const byBrand = (item: Item) => item.brand;

	it('sorts by the chosen value', () => {
		expect(names(sortItems([manta, agar, kafka], byBrand, byName, false))).toEqual([
			'Manta',
			'Agar',
			'Kafka'
		]);
	});

	it('reverses the chosen value when descending', () => {
		expect(names(sortItems([manta, agar, kafka], byBrand, byName, true))).toEqual([
			'Kafka',
			'Agar',
			'Manta'
		]);
	});

	it('keeps items without a value last in either direction', () => {
		const byPrice = (item: Item) => item.price;

		expect(names(sortItems([kafka, manta, agar], byPrice, byName, false))).toEqual([
			'Agar',
			'Manta',
			'Kafka'
		]);
		expect(names(sortItems([kafka, agar, manta], byPrice, byName, true))).toEqual([
			'Manta',
			'Agar',
			'Kafka'
		]);
	});

	it('breaks ties by name, A to Z even when descending', () => {
		const twin = { ...agar, id: 'twin', name: 'Aardvark' };

		expect(names(sortItems([agar, twin], (item) => item.price, byName, true))).toEqual([
			'Aardvark',
			'Agar'
		]);
	});

	it('does not change the list it was given', () => {
		const list = [manta, agar];

		sortItems(list, byName, byName, false);

		expect(names(list)).toEqual(['Manta', 'Agar']);
	});
});

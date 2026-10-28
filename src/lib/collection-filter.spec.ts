import { describe, expect, it } from 'vitest';
import {
	compareValues,
	fieldSuggestions,
	filterByFields,
	filterByStatus,
	parseFieldQuery,
	searchCollection,
	searchItems,
	sortItems,
	type SearchField
} from './collection-filter';

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

	it('matches text at any depth, including inside lists, such as kit names', () => {
		const set = {
			id: 'olivia-id',
			name: 'Olivia',
			kits: [{ kitId: 'k1', name: 'Novelties', purchase: { vendor: 'CannonKeys' } }]
		};

		expect(searchItems([set], 'novelt')).toEqual([set]);
		expect(searchItems([set], 'cannon')).toEqual([set]);
	});

	it('skips ids, image urls and moderation fields', () => {
		const withImage = {
			id: 'x',
			name: 'Plain',
			primaryKitId: 'kit-abc',
			images: [
				{
					imageId: 'img-abc',
					url: 'https://img.example/abc.png',
					status: 'rejected',
					rejectionReason: 'Explicit'
				}
			],
			keyboard: { id: 'kb-abc', imageUrl: 'https://img.example/kb.png' }
		};

		for (const text of ['abc', 'img.example', 'rejected', 'explicit']) {
			expect(searchItems([withImage], text)).toEqual([]);
		}
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

type Set = { name: string; brand: string; material?: string; kits?: { name: string }[] };

const olivia: Set = {
	name: 'Olivia',
	brand: 'GMK',
	material: 'DualShot ABS',
	kits: [{ name: 'Base' }, { name: 'Novelties' }]
};
const modern: Set = {
	name: 'Modern Dolch',
	brand: 'SWG',
	material: 'dualshot abs',
	kits: [{ name: 'Base' }]
};
const nord: Set = { name: 'Nord', brand: 'SWG', material: 'PBT' };

const setFields: SearchField<Set>[] = [
	{ tag: 'brand', description: 'Brand', values: (set) => [set.brand] },
	{ tag: 'material', description: 'Material', values: (set) => [set.material] },
	{ tag: 'kit', description: 'Kit name', values: (set) => set.kits?.map((kit) => kit.name) ?? [] }
];
const setNames = (sets: Set[]) => sets.map((set) => set.name);

describe('filterByFields', () => {
	it('keeps everything with no filters', () => {
		expect(filterByFields([olivia, nord], setFields, [])).toHaveLength(2);
	});

	it("matches a filter as a substring of that field's values, ignoring case", () => {
		expect(
			setNames(
				filterByFields([olivia, modern, nord], setFields, [{ tag: 'material', value: 'ABS' }])
			)
		).toEqual(['Olivia', 'Modern Dolch']);
	});

	it('needs every filter to match, a repeated field included', () => {
		const swgAbs = [
			{ tag: 'brand', value: 'swg' },
			{ tag: 'material', value: 'abs' }
		];
		const baseAndNovelties = [
			{ tag: 'kit', value: 'base' },
			{ tag: 'kit', value: 'novelties' }
		];

		expect(setNames(filterByFields([olivia, modern, nord], setFields, swgAbs))).toEqual([
			'Modern Dolch'
		]);
		expect(setNames(filterByFields([olivia, modern, nord], setFields, baseAndNovelties))).toEqual([
			'Olivia'
		]);
	});

	it('ignores a filter on a field the page no longer offers', () => {
		expect(filterByFields([olivia], setFields, [{ tag: 'profile', value: 'cherry' }])).toEqual([
			olivia
		]);
	});
});

describe('fieldSuggestions', () => {
	const material = setFields[1];
	const kit = setFields[2];

	it('lists the values in use once each, whatever their case, A to Z', () => {
		expect(fieldSuggestions([olivia, modern, nord], material, '')).toEqual(['DualShot ABS', 'PBT']);
		expect(fieldSuggestions([olivia, modern], kit, '')).toEqual(['Base', 'Novelties']);
	});

	it('keeps only values containing the query', () => {
		expect(fieldSuggestions([olivia, modern, nord], material, ' pb')).toEqual(['PBT']);
	});
});

describe('parseFieldQuery', () => {
	it('splits a known tag from what follows it', () => {
		expect(parseFieldQuery('Material:dual', setFields)).toEqual({
			field: setFields[1],
			query: 'dual'
		});
		expect(parseFieldQuery('kit:', setFields)?.query).toBe('');
	});

	it('is null for plain text or a tag the page does not offer', () => {
		expect(parseFieldQuery('dual', setFields)).toBeNull();
		expect(parseFieldQuery('profile:cherry', setFields)).toBeNull();
	});
});

describe('searchCollection', () => {
	it('applies plain text across every field, then the filters', () => {
		expect(
			setNames(
				searchCollection([olivia, modern, nord], setFields, 'dol', [{ tag: 'brand', value: 'swg' }])
			)
		).toEqual(['Modern Dolch']);
	});

	it('treats a `tag:value` still being typed as a filter on that field', () => {
		expect(
			setNames(searchCollection([olivia, modern, nord], setFields, 'material:pb', []))
		).toEqual(['Nord']);
	});

	it('ignores a tag with nothing typed after it yet', () => {
		expect(searchCollection([olivia, nord], setFields, 'material:', [])).toHaveLength(2);
	});
});

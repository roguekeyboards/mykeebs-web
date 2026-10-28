import type { StatusFilter } from '#lib/order-status.js';

export type SortValue = string | number | undefined;

export function filterByStatus<T>(
	items: T[],
	statusFilter: StatusFilter,
	getOrderStatus: ((item: T) => string | undefined) | undefined
): T[] {
	if (!getOrderStatus || statusFilter === 'all') return items;
	return items.filter((item) => (getOrderStatus(item) ?? '').toLowerCase() === statusFilter);
}

export type SearchField<T> = {
	tag: string;
	description: string;
	values: (item: T) => (string | null | undefined)[];
};

export type FieldFilter = { tag: string; value: string };

// Ids, image urls and moderation fields, which nobody means to search.
function skippedKey(key: string): boolean {
	return ['id', 'url', 'imageUrl', 'status', 'rejectionReason'].includes(key) || key.endsWith('Id');
}

function textMatches(value: unknown, needle: string): boolean {
	if (typeof value === 'string') return value.toLowerCase().includes(needle);
	if (Array.isArray(value)) return value.some((entry) => textMatches(entry, needle));
	if (value != null && typeof value === 'object' && !(value instanceof Date)) {
		return Object.entries(value).some(
			([key, nested]) => !skippedKey(key) && textMatches(nested, needle)
		);
	}
	return false;
}

export function searchItems<T>(items: T[], text: string): T[] {
	const needle = text.trim().toLowerCase();
	if (!needle) return items;
	return items.filter((item) => textMatches(item, needle));
}

export function filterByFields<T>(
	items: T[],
	fields: SearchField<T>[],
	filters: FieldFilter[]
): T[] {
	if (filters.length === 0) return items;
	return items.filter((item) =>
		filters.every((filter) => {
			const field = fields.find((candidate) => candidate.tag === filter.tag);
			const needle = filter.value.trim().toLowerCase();
			return !field || field.values(item).some((value) => value?.toLowerCase().includes(needle));
		})
	);
}

// The values the items actually use, once each whatever their case, that contain the query.
export function fieldSuggestions<T>(items: T[], field: SearchField<T>, query: string): string[] {
	const needle = query.trim().toLowerCase();
	const seen = new Map<string, string>();
	for (const item of items) {
		for (const value of field.values(item)) {
			const trimmed = value?.trim();
			if (!trimmed || !trimmed.toLowerCase().includes(needle)) continue;
			if (!seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
		}
	}
	return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// `material:dual` → the material field and "dual", for a tag the page offers.
export function parseFieldQuery<T>(
	text: string,
	fields: SearchField<T>[]
): { field: SearchField<T>; query: string } | null {
	const match = /^\s*([a-z]+):(.*)$/i.exec(text);
	const field = match && fields.find((candidate) => candidate.tag === match[1].toLowerCase());
	return field ? { field, query: match[2] } : null;
}

// Plain text searches every field; a `tag:value` still being typed already filters that field.
export function searchCollection<T>(
	items: T[],
	fields: SearchField<T>[],
	text: string,
	filters: FieldFilter[]
): T[] {
	const typing = parseFieldQuery(text, fields);
	if (!typing) return filterByFields(searchItems(items, text), fields, filters);
	const typed = typing.query.trim() ? [{ tag: typing.field.tag, value: typing.query }] : [];
	return filterByFields(items, fields, [...filters, ...typed]);
}

export function compareValues(a: SortValue, b: SortValue): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	return String(a).localeCompare(String(b));
}

export function sortItems<T>(
	items: T[],
	getValue: (item: T) => SortValue,
	getName: (item: T) => string | undefined,
	descending: boolean
): T[] {
	return [...items].sort((a, b) => {
		const valueA = getValue(a);
		const valueB = getValue(b);
		if ((valueA == null) !== (valueB == null)) return valueA == null ? 1 : -1;
		const primary = compareValues(valueA, valueB);
		if (primary !== 0) return descending ? -primary : primary;
		return compareValues(getName(a), getName(b));
	});
}

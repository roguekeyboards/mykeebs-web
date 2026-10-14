import type { StatusFilter } from '$lib/order-status';

export type SortValue = string | number | undefined;

export function filterByStatus<T>(
	items: T[],
	statusFilter: StatusFilter,
	getOrderStatus: ((item: T) => string | undefined) | undefined
): T[] {
	if (!getOrderStatus || statusFilter === 'all') return items;
	return items.filter((item) => (getOrderStatus(item) ?? '').toLowerCase() === statusFilter);
}

function valueMatches(value: unknown, needle: string): boolean {
	if (typeof value === 'string') return value.toLowerCase().includes(needle);
	if (value != null && typeof value === 'object' && !(value instanceof Date)) {
		return Object.values(value).some(
			(nested) => typeof nested === 'string' && nested.toLowerCase().includes(needle)
		);
	}
	return false;
}

export function searchItems<T>(items: T[], text: string): T[] {
	const needle = text.trim().toLowerCase();
	if (!needle) return items;
	return items.filter((item) =>
		Object.entries(item as Record<string, unknown>).some(
			([key, value]) => key !== 'id' && valueMatches(value, needle)
		)
	);
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

import { formatDate, toDateInput } from '#lib/format.js';

const QUARTERS_LISTED = 6;

export type QuarterOption = { value: string; label: string };

type YearQuarter = { year: number; quarter: number };

function parse(date: string): YearQuarter | undefined {
	const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
	if (!match) return undefined;
	return { year: Number(match[1]), quarter: Math.ceil(Number(match[2]) / 3) };
}

function quarterEnd({ year, quarter }: YearQuarter): string {
	const month = quarter * 3;
	const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${day}`;
}

export function quarterEndOf(date: string): string | undefined {
	const parsed = parse(date);
	return parsed && quarterEnd(parsed);
}

export function quarterLabel(date: string): string | undefined {
	const parsed = parse(date);
	if (!parsed || quarterEnd(parsed) !== date) return undefined;
	return `Q${parsed.quarter} ${parsed.year}`;
}

export function quarterOptions(today: string, current = ''): QuarterOption[] {
	const start = parse(today);
	if (!start) return [];
	const values = Array.from({ length: QUARTERS_LISTED }, (_, i) => {
		const index = start.quarter - 1 + i;
		return quarterEnd({ year: start.year + Math.floor(index / 4), quarter: (index % 4) + 1 });
	});
	if (quarterLabel(current) && !values.includes(current)) values.push(current);
	return values.sort().map((value) => ({ value, label: quarterLabel(value)! }));
}

export function awaitingDelivery(orderStatus: string | undefined): boolean {
	const status = orderStatus?.trim().toLowerCase() ?? '';
	return !['', 'planned', 'delivered', 'cancelled'].includes(status);
}

export function formatEstimate(date: Date | undefined): string | undefined {
	return date ? (quarterLabel(toDateInput(date)) ?? formatDate(date)) : undefined;
}

import { describe, expect, it } from 'vitest';
import {
	awaitingDelivery,
	formatEstimate,
	quarterEndOf,
	quarterLabel,
	quarterOptions
} from './estimated-delivery';

describe('quarterLabel', () => {
	it('names the quarter a quarter-end date closes', () => {
		expect(quarterLabel('2027-03-31')).toBe('Q1 2027');
		expect(quarterLabel('2027-06-30')).toBe('Q2 2027');
		expect(quarterLabel('2027-09-30')).toBe('Q3 2027');
		expect(quarterLabel('2027-12-31')).toBe('Q4 2027');
	});

	it('is undefined for any other date', () => {
		expect(quarterLabel('2027-03-30')).toBeUndefined();
		expect(quarterLabel('2027-04-01')).toBeUndefined();
		expect(quarterLabel('2027-06-31')).toBeUndefined();
		expect(quarterLabel('')).toBeUndefined();
	});
});

describe('quarterOptions', () => {
	it('lists the current quarter and the five after it, across years', () => {
		expect(quarterOptions('2026-11-25')).toEqual([
			{ value: '2026-12-31', label: 'Q4 2026' },
			{ value: '2027-03-31', label: 'Q1 2027' },
			{ value: '2027-06-30', label: 'Q2 2027' },
			{ value: '2027-09-30', label: 'Q3 2027' },
			{ value: '2027-12-31', label: 'Q4 2027' },
			{ value: '2028-03-31', label: 'Q1 2028' }
		]);
	});

	it('counts the last day of a quarter as part of it', () => {
		expect(quarterOptions('2027-03-31')[0]).toEqual({ value: '2027-03-31', label: 'Q1 2027' });
		expect(quarterOptions('2027-04-01')[0]).toEqual({ value: '2027-06-30', label: 'Q2 2027' });
	});

	it('keeps a saved quarter outside the window, in order', () => {
		const values = (current: string) => quarterOptions('2026-11-25', current).map((q) => q.value);

		expect(values('2026-06-30')[0]).toBe('2026-06-30');
		expect(values('2029-12-31').at(-1)).toBe('2029-12-31');
		expect(values('2026-06-30')).toHaveLength(7);
	});

	it('adds nothing for a saved date that is not a quarter end, or one already listed', () => {
		expect(quarterOptions('2026-11-25', '2026-06-15')).toHaveLength(6);
		expect(quarterOptions('2026-11-25', '2027-03-31')).toHaveLength(6);
	});
});

describe('formatEstimate', () => {
	it('shows a quarter end as its quarter and any other date as a date', () => {
		expect(formatEstimate(new Date('2027-03-31'))).toBe('Q1 2027');
		expect(formatEstimate(new Date('2027-02-14'))).toBe('Feb 14, 2027');
		expect(formatEstimate(undefined)).toBeUndefined();
	});
});

describe('awaitingDelivery', () => {
	it('is true once ordered and until delivered or cancelled', () => {
		expect(['Ordered', 'shipped', ' In production '].map(awaitingDelivery)).toEqual([
			true,
			true,
			true
		]);
		expect(['', 'Planned', 'Delivered', 'cancelled', undefined].map(awaitingDelivery)).toEqual([
			false,
			false,
			false,
			false,
			false
		]);
	});
});

describe('quarterEndOf', () => {
	it('is the last day of the quarter a date falls in', () => {
		expect(quarterEndOf('2026-11-25')).toBe('2026-12-31');
		expect(quarterEndOf('2027-04-01')).toBe('2027-06-30');
		expect(quarterEndOf('2027-03-31')).toBe('2027-03-31');
		expect(quarterEndOf('nope')).toBeUndefined();
	});
});

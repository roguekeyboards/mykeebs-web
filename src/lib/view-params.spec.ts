import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, readView, sortSlug, urlWithView, viewParams } from './view-params';

const options = { tags: ['brand', 'available'], sorts: ['price', 'order-date'] };
const read = (search: string) => readView(new URLSearchParams(search), options);

describe('sortSlug', () => {
	it('turns a sort label into a lowercase, hyphenated slug', () => {
		expect(sortSlug('Order date')).toBe('order-date');
		expect(sortSlug('Estimated delivery')).toBe('estimated-delivery');
	});
});

describe('readView', () => {
	it('is the default view for an address without any of its parameters', () => {
		expect(read('?open=sw-1')).toEqual(DEFAULT_VIEW);
	});

	it('reads the status, filters, text, sort and direction', () => {
		expect(
			read('?status=Delivered&f=brand:=Gateron&f=available:90&q=oil&sort=price&desc=1')
		).toEqual({
			status: 'delivered',
			filters: [
				{ tag: 'brand', value: 'Gateron', exact: true },
				{ tag: 'available', value: '90' }
			],
			text: 'oil',
			sort: 'price',
			descending: true
		});
	});

	it('drops a status, filter or sort the page does not offer', () => {
		expect(read('?status=lost&f=colour:red&f=brand:&f=nonsense&sort=weight&desc=yes')).toEqual(
			DEFAULT_VIEW
		);
	});
});

describe('viewParams', () => {
	it('leaves out everything at its default', () => {
		expect(viewParams(DEFAULT_VIEW).toString()).toBe('');
	});

	it('round-trips through readView', () => {
		const view = read('?status=shipped&f=brand:=Gateron&f=brand:ate&q=oil&sort=order-date&desc=1');

		expect(read(`?${viewParams(view)}`)).toEqual(view);
	});
});

describe('urlWithView', () => {
	it("replaces the view's parameters and keeps the rest", () => {
		const url = new URL('http://localhost/u/me/switches?open=sw-1&status=planned&f=brand:hmx');

		const next = urlWithView(url, { ...DEFAULT_VIEW, status: 'delivered' });

		expect(next.search).toBe('?open=sw-1&status=delivered');
		expect(url.search).toBe('?open=sw-1&status=planned&f=brand:hmx');
	});
});

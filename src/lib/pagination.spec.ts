import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages, type PageRequest } from './pagination';

describe('fetchAllPages', () => {
	it('follows the cursor until there is no next page', async () => {
		const fetchPage = vi.fn(async ({ cursor }: PageRequest) =>
			cursor === undefined
				? { items: [1, 2], nextCursor: 'c-2' }
				: cursor === 'c-2'
					? { items: [3], nextCursor: 'c-3' }
					: { items: [4], nextCursor: null }
		);

		expect(await fetchAllPages(fetchPage)).toEqual([1, 2, 3, 4]);
		expect(fetchPage.mock.calls.map(([{ cursor }]) => cursor)).toEqual([undefined, 'c-2', 'c-3']);
	});

	it("asks for mykeebs-api's largest page every time", async () => {
		const fetchPage = vi.fn(async ({ cursor }: PageRequest) =>
			cursor === undefined ? { items: [1], nextCursor: 'c-2' } : { items: [2] }
		);

		await fetchAllPages(fetchPage);
		expect(fetchPage.mock.calls.map(([{ limit }]) => limit)).toEqual([100, 100]);
	});

	it('treats a page without items as empty', async () => {
		expect(await fetchAllPages(async () => ({}))).toEqual([]);
	});

	it('passes a failed page through', async () => {
		await expect(
			fetchAllPages(async () => {
				throw new Error('network');
			})
		).rejects.toThrow('network');
	});
});

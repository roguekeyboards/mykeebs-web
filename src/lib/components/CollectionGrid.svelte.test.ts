import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import CollectionGrid from './CollectionGrid.svelte';

type Item = { id: string; name: string; brand: string; price?: number; status?: string };

const manta: Item = { id: 'kb-1', name: 'Manta', brand: 'Bowl', price: 450, status: 'Delivered' };
const agar: Item = { id: 'kb-2', name: 'Agar', brand: 'KBDFans', price: 125, status: 'Ordered' };
const kafka: Item = { id: 'kb-3', name: 'Kafka', brand: 'Typeface', status: 'Delivered' };

const card = createRawSnippet((item: () => Item) => ({
	render: () => `<article>${item().name}</article>`
}));

async function renderGrid(overrides: Record<string, unknown> = {}) {
	const fetchPage = vi.fn(async () => ({ items: [manta, agar, kafka] }));
	await render(CollectionGrid, {
		userId: 'user-1',
		fetchPage,
		itemKey: (item: Item) => item.id,
		emptyMessage: 'No keyboards yet.',
		sortOptions: [
			{ label: 'Name', getValue: (item: Item) => item.name },
			{ label: 'Price', getValue: (item: Item) => item.price }
		],
		getName: (item: Item) => item.name,
		getOrderStatus: (item: Item) => item.status,
		card,
		...overrides
	} as never);
	return fetchPage;
}

async function shown(): Promise<string[]> {
	await expect.element(page.getByRole('article').first()).toBeInTheDocument();
	return page
		.getByRole('article')
		.all()
		.map((article) => article.element().textContent ?? '');
}

describe('CollectionGrid.svelte', () => {
	it('loads every page for the user and lists the items by name', async () => {
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ items: [manta], nextCursor: 'c-2' })
			.mockResolvedValueOnce({ items: [agar, kafka] });
		await renderGrid({ fetchPage });

		await expect.element(page.getByRole('article')).toHaveLength(3);
		expect(await shown()).toEqual(['Agar', 'Kafka', 'Manta']);
		expect(fetchPage.mock.calls).toEqual([
			['user-1', { cursor: undefined, limit: 100 }],
			['user-1', { cursor: 'c-2', limit: 100 }]
		]);
	});

	it('shows loading until the items arrive', async () => {
		await renderGrid({ fetchPage: () => new Promise(() => {}) });

		await expect
			.element(page.getByRole('status').filter({ hasText: 'Loading…' }))
			.toBeInTheDocument();
	});

	it('says so when loading fails', async () => {
		await renderGrid({ fetchPage: async () => Promise.reject(new Error('network')) });

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not load this collection.' }))
			.toBeInTheDocument();
	});

	it('shows the empty message for an empty collection', async () => {
		await renderGrid({ fetchPage: async () => ({ items: [] }) });

		await expect
			.element(page.getByRole('status').filter({ hasText: 'No keyboards yet.' }))
			.toBeInTheDocument();
	});

	describe('status filter', () => {
		it('narrows the list to one order status', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('button', { name: 'Delivered' }).click();

			await expect.element(page.getByRole('article')).toHaveLength(2);
			expect(await shown()).toEqual(['Kafka', 'Manta']);
			await expect
				.element(page.getByRole('button', { name: 'Delivered' }))
				.toHaveAttribute('aria-pressed', 'true');
		});

		it('says no matches when a filter empties a non-empty collection', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('button', { name: 'Cancelled' }).click();

			await expect
				.element(page.getByRole('status').filter({ hasText: 'No matches.' }))
				.toBeInTheDocument();
		});

		it('is not offered for items without an order status', async () => {
			await renderGrid({ getOrderStatus: undefined });
			await shown();

			await expect
				.element(page.getByRole('group', { name: 'Filter by order status' }))
				.not.toBeInTheDocument();
		});
	});

	describe('search', () => {
		it('opens a search box that narrows the list as you type', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('button', { name: 'Filter' }).click();
			await expect.element(page.getByRole('searchbox', { name: 'Filter' })).toHaveFocus();
			await userEvent.keyboard('type');

			await expect.element(page.getByRole('article')).toHaveLength(1);
			expect(await shown()).toEqual(['Kafka']);
		});

		it('clears and closes on Escape', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('button', { name: 'Filter' }).click();
			await userEvent.keyboard('type{Escape}');

			await expect.element(page.getByRole('searchbox', { name: 'Filter' })).not.toBeInTheDocument();
			await expect.element(page.getByRole('article')).toHaveLength(3);
		});
	});

	describe('sorting', () => {
		it('sorts by the chosen option, with missing values last', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Price');

			await vi.waitFor(async () => expect(await shown()).toEqual(['Agar', 'Manta', 'Kafka']));
		});

		it('flips the order with the direction button', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('button', { name: 'Sort descending' }).click();

			await vi.waitFor(async () => expect(await shown()).toEqual(['Manta', 'Kafka', 'Agar']));
			await expect
				.element(page.getByRole('button', { name: 'Sort ascending' }))
				.toBeInTheDocument();
		});
	});

	describe('adding', () => {
		it('offers an add button when it can add', async () => {
			const onAdd = vi.fn();
			await renderGrid({ onAdd, addLabel: 'Add keyboard' });
			await shown();

			await page.getByRole('button', { name: 'Add keyboard' }).click();

			expect(onAdd).toHaveBeenCalledOnce();
		});

		it('offers no add button otherwise', async () => {
			await renderGrid();
			await shown();

			await expect.element(page.getByRole('button', { name: /^Add/ })).not.toBeInTheDocument();
		});
	});
});

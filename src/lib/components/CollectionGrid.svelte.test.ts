import { cdp, page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import CollectionGrid from './CollectionGrid.svelte';
import '../../routes/layout.css';

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
			await expect.element(page.getByRole('combobox', { name: 'Filter' })).toHaveFocus();
			await userEvent.keyboard('type');

			await expect.element(page.getByRole('article')).toHaveLength(1);
			expect(await shown()).toEqual(['Kafka']);
		});

		it('clears and closes on Escape', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('button', { name: 'Filter' }).click();
			await userEvent.keyboard('type{Escape}');

			await expect.element(page.getByRole('combobox', { name: 'Filter' })).not.toBeInTheDocument();
			await expect.element(page.getByRole('article')).toHaveLength(3);
		});
	});

	describe('field filters', () => {
		const searchFields = [
			{ tag: 'brand', description: 'Who makes it', values: (item: Item) => [item.brand] },
			{ tag: 'status', description: 'Order status', values: (item: Item) => [item.status] }
		];
		const filterBox = () => page.getByRole('combobox', { name: 'Filter' });
		const option = (name: string | RegExp) => page.getByRole('option', { name });

		async function openSearch() {
			await renderGrid({ searchFields });
			await shown();
			await page.getByRole('button', { name: 'Filter' }).click();
			await expect.element(filterBox()).toHaveFocus();
		}

		it('lists the fields with their descriptions when the box opens', async () => {
			await openSearch();

			await expect.element(filterBox()).toHaveAttribute('aria-expanded', 'true');
			await expect.element(option(/brand: Who makes it/)).toBeInTheDocument();
			await expect.element(option(/status: Order status/)).toBeInTheDocument();
		});

		it('narrows the fields to the tag being typed', async () => {
			await openSearch();

			await userEvent.keyboard('st');

			await expect.element(option(/status:/)).toBeInTheDocument();
			await expect.element(option(/brand:/)).not.toBeInTheDocument();
		});

		it('picks a field, then a value, from the keyboard, as a chip', async () => {
			await openSearch();

			await userEvent.keyboard('{ArrowDown}{Enter}');
			await expect.element(filterBox()).toHaveValue('brand:');
			await expect.element(option('Bowl')).toBeInTheDocument();
			await expect.element(option('KBDFans')).toBeInTheDocument();
			await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

			await expect
				.element(page.getByRole('button', { name: 'Remove filter brand: KBDFans' }))
				.toBeInTheDocument();
			await expect.element(filterBox()).toHaveValue('');
			expect(await shown()).toEqual(['Agar']);
			await expect.element(page.getByText('Added filter brand: KBDFans')).toBeInTheDocument();
		});

		it('picks with the mouse too', async () => {
			await openSearch();

			await option(/status:/).click();
			await option('Delivered').click();

			await expect.element(page.getByRole('article')).toHaveLength(2);
			expect(await shown()).toEqual(['Kafka', 'Manta']);
		});

		it('filters on a typed `tag:value` as it is typed, and keeps it as a chip on Enter', async () => {
			await openSearch();

			await userEvent.keyboard('brand:ow');
			await expect.element(page.getByRole('article')).toHaveLength(1);
			await userEvent.keyboard('{Enter}');

			await expect
				.element(page.getByRole('button', { name: 'Remove filter brand: ow' }))
				.toBeInTheDocument();
			expect(await shown()).toEqual(['Manta']);
		});

		it('needs every chip and the plain text to match', async () => {
			await openSearch();

			await userEvent.keyboard('status:deliv{Enter}');
			await expect.element(page.getByRole('article')).toHaveLength(2);
			await userEvent.keyboard('kaf');

			await expect.element(page.getByRole('article')).toHaveLength(1);
			expect(await shown()).toEqual(['Kafka']);
		});

		it('removes the last chip with Backspace, or any chip with its button', async () => {
			await openSearch();
			await userEvent.keyboard('status:deliv{Enter}brand:bowl{Enter}');
			await expect.element(page.getByRole('article')).toHaveLength(1);

			await userEvent.keyboard('{Backspace}');
			await expect.element(page.getByText('Removed filter brand: bowl')).toBeInTheDocument();
			await expect.element(page.getByRole('article')).toHaveLength(2);

			await page.getByRole('button', { name: 'Remove filter status: deliv' }).click();
			await expect.element(page.getByRole('article')).toHaveLength(3);
			await expect.element(filterBox()).toHaveFocus();
		});

		it('closes the list on Escape, then clears everything on a second Escape', async () => {
			await openSearch();
			await userEvent.keyboard('status:deliv{Enter}');

			await userEvent.keyboard('{Escape}');
			await expect.element(filterBox()).toHaveAttribute('aria-expanded', 'false');
			await expect.element(page.getByRole('article')).toHaveLength(2);

			await userEvent.keyboard('{Escape}');
			await expect.element(filterBox()).not.toBeInTheDocument();
			await expect.element(page.getByRole('article')).toHaveLength(3);
		});

		it('stays open with chips in it when focus leaves', async () => {
			await openSearch();
			await userEvent.keyboard('status:deliv{Enter}');

			filterBox().element().blur();

			await expect.element(filterBox()).toBeInTheDocument();
			await expect.element(page.getByRole('article')).toHaveLength(2);
		});

		it('completes the first suggestion with Tab, a field and then a value', async () => {
			await openSearch();

			await userEvent.keyboard('st{Tab}');
			await expect.element(filterBox()).toHaveValue('status:');
			await userEvent.keyboard('ord{Tab}');

			await expect
				.element(page.getByRole('button', { name: 'Remove filter status: Ordered' }))
				.toBeInTheDocument();
			expect(await shown()).toEqual(['Agar']);
			await expect.element(filterBox()).toHaveFocus();
		});

		it('completes the highlighted suggestion with Tab', async () => {
			await openSearch();

			await userEvent.keyboard('{ArrowDown}{ArrowDown}{Tab}');

			await expect.element(filterBox()).toHaveValue('status:');
		});

		it('leaves Tab to move focus when nothing is typed or highlighted', async () => {
			await openSearch();

			await userEvent.keyboard('{Tab}');

			// Focus left the empty box, so it closed.
			await expect.element(filterBox()).not.toBeInTheDocument();
		});

		it("doesn't pick a field when Enter is pressed on plain text", async () => {
			await openSearch();

			await userEvent.keyboard('b{Enter}');

			await expect.element(filterBox()).toHaveValue('b');
		});
	});

	describe('sorting', () => {
		it("fits the longest option beside the owner's buttons on a 360px touch screen", async () => {
			await page.viewport(360, 800);
			// The profile layout's px-4.
			document.body.style.paddingInline = '1rem';
			await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
			try {
				await renderGrid({
					onAdd: () => {},
					sortOptions: [{ label: 'Delivery date', getValue: (item: Item) => item.name }]
				});
				await shown();
				await document.fonts.ready;

				const select = page
					.getByRole('combobox', { name: 'Sort by' })
					.element() as HTMLSelectElement;
				const style = getComputedStyle(select);
				const context = document.createElement('canvas').getContext('2d')!;
				context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
				const room =
					select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

				expect(style.fontSize).toBe('16px');
				expect(context.measureText(select.selectedOptions[0].text).width).toBeLessThanOrEqual(room);
			} finally {
				await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
				await page.viewport(414, 896);
				document.body.style.paddingInline = '';
			}
		});

		it('sorts by the chosen option, with missing values last', async () => {
			await renderGrid();
			await shown();

			await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Price');

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

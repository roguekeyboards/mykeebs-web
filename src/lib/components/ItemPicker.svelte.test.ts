import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ItemPicker, { type ItemPickerCache } from './ItemPicker.svelte';

type Item = { id: string; name: string };

const items: Item[] = [
	{ id: '1', name: 'Alpha' },
	{ id: '2', name: 'Bravo' },
	{ id: '3', name: 'Charlie' }
];

function fetchPage() {
	return Promise.resolve({ items, nextCursor: null });
}

describe('ItemPicker.svelte', () => {
	it('names the search box and list from the placeholder, and keeps options out of the Tab order', async () => {
		await render(ItemPicker, {
			userId: 'u1',
			fetchPage,
			itemKey: (item: unknown) => (item as Item).id,
			getLabel: (item: unknown) => (item as Item).name,
			placeholder: 'Search keyboards…',
			onPick: vi.fn()
		});
		const input = page.getByRole('combobox', { name: 'Search keyboards' });
		await expect
			.element(page.getByRole('listbox', { name: 'Search keyboards' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();

		await input.click();
		await userEvent.keyboard('{Tab}');

		expect(document.activeElement?.getAttribute('role')).not.toBe('option');
	});

	it('navigates and picks with the keyboard', async () => {
		const onPick = vi.fn();
		await render(ItemPicker, {
			userId: 'u1',
			fetchPage,
			itemKey: (item: unknown) => (item as Item).id,
			getLabel: (item: unknown) => (item as Item).name,
			onPick
		});

		await expect.element(page.getByText('Alpha')).toBeInTheDocument();

		const input = page.getByRole('combobox');
		await input.click();
		await userEvent.keyboard('{ArrowDown}{Enter}');

		expect(onPick).toHaveBeenCalledWith(items[1]);
	});

	it('Escape clears filter text first, then calls onCancel', async () => {
		const onPick = vi.fn();
		const onCancel = vi.fn();
		await render(ItemPicker, {
			userId: 'u1',
			fetchPage,
			itemKey: (item: unknown) => (item as Item).id,
			getLabel: (item: unknown) => (item as Item).name,
			onPick,
			onCancel
		});

		await expect.element(page.getByText('Alpha')).toBeInTheDocument();

		const input = page.getByRole('combobox');
		await input.fill('Bra');
		await input.click();
		await userEvent.keyboard('{Escape}');
		await expect.element(input).toHaveValue('');
		expect(onCancel).not.toHaveBeenCalled();

		await userEvent.keyboard('{Escape}');
		expect(onCancel).toHaveBeenCalled();
	});

	it('reuses a passed-in cache instead of re-fetching on remount', async () => {
		const fetchSpy = vi.fn(fetchPage);
		const cache: ItemPickerCache<Item> = { items: null };

		const first = await render(ItemPicker, {
			userId: 'u1',
			fetchPage: fetchSpy,
			itemKey: (item: unknown) => (item as Item).id,
			getLabel: (item: unknown) => (item as Item).name,
			onPick: vi.fn(),
			cache
		});
		await expect.element(page.getByText('Alpha')).toBeInTheDocument();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(cache.items).toEqual(items);

		await first.unmount();

		await render(ItemPicker, {
			userId: 'u1',
			fetchPage: fetchSpy,
			itemKey: (item: unknown) => (item as Item).id,
			getLabel: (item: unknown) => (item as Item).name,
			onPick: vi.fn(),
			cache
		});
		await expect.element(page.getByText('Alpha')).toBeInTheDocument();
		// Second mount served from cache -- no additional fetch.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});

import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus, type Keyboard } from '@rogueserenity/kbdb-api-client';
import KeyboardDetails from './KeyboardDetails.svelte';

const BROKEN = 'data:image/png;base64,bm90IGFuIGltYWdl';
const FRESH =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function keyboard(url: string): Keyboard {
	return { id: 'k', brand: 'KBDFans', name: 'Agar', images: [{ imageId: 'i1', url }] };
}

describe('KeyboardDetails.svelte', () => {
	it('hides an image that fails to load and reports it', async () => {
		const onImageError = vi.fn();
		await render(KeyboardDetails, {
			keyboard: keyboard(BROKEN),
			onImageClick: vi.fn(),
			onImageError,
			showPrice: true
		});

		await vi.waitFor(() => expect(onImageError).toHaveBeenCalledOnce());
		await expect.element(page.getByRole('img', { name: 'Agar' })).not.toBeInTheDocument();
	});

	it('shows the image again once a refetch brings a fresh URL', async () => {
		const onImageError = vi.fn();
		const { rerender } = await render(KeyboardDetails, {
			keyboard: keyboard(BROKEN),
			onImageClick: vi.fn(),
			onImageError,
			showPrice: true
		});
		await vi.waitFor(() => expect(onImageError).toHaveBeenCalledOnce());

		await rerender({ keyboard: keyboard(FRESH) });

		await expect.element(page.getByRole('img', { name: 'Agar' })).toBeInTheDocument();
		expect(onImageError).toHaveBeenCalledOnce();
	});

	describe('image moderation', () => {
		const moderated: Keyboard = {
			id: 'k',
			brand: 'KBDFans',
			name: 'Agar',
			images: [
				{ imageId: 'rejected', status: ImageStatus.Rejected, rejectionReason: 'Explicit' },
				{ imageId: 'pending', url: FRESH, status: ImageStatus.Pending },
				{ imageId: 'approved', url: FRESH, status: ImageStatus.Approved }
			]
		};

		it('shows a rejected image by its reason and marks a pending one', async () => {
			await render(KeyboardDetails, {
				keyboard: moderated,
				onImageClick: vi.fn(),
				showPrice: true
			});

			await expect
				.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
				.toBeInTheDocument();
			await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'View full size image, pending review' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('img', { name: 'Agar' }).nth(1)).toBeInTheDocument();
		});

		it('opens the gallery at the position among the images that can be viewed', async () => {
			const onImageClick = vi.fn();
			await render(KeyboardDetails, { keyboard: moderated, onImageClick, showPrice: true });

			await page.getByRole('button', { name: 'View full size image' }).nth(1).click();

			expect(onImageClick).toHaveBeenCalledWith(1);
		});
	});

	describe('plates, PCBs and prices', () => {
		const parts: Keyboard = {
			id: 'k',
			brand: 'Bowl',
			name: 'Manta',
			plates: [
				{ id: 'p1', material: 'POM' },
				{
					id: 'p2',
					material: 'Aluminum',
					color: 'Silver',
					thickness: 1.5,
					purchase: { vendor: 'CannonKeys', price: 40, currency: 'USD', orderStatus: 'Ordered' }
				}
			],
			pcbs: [{ id: 'c1', firmware: 'QMK', assembly: 'Hotswap' }],
			purchase: { vendor: 'Bowl', price: 300, currency: 'USD' },
			totalCost: 340,
			currency: 'USD'
		};

		async function renderParts(showPrice: boolean) {
			await render(KeyboardDetails, { keyboard: parts, onImageClick: vi.fn(), showPrice });
		}

		it('lists each part, with its own purchase or as part of the keyboard', async () => {
			await renderParts(true);

			const items = page.getByRole('listitem');
			await expect.element(items.nth(0)).toHaveTextContent(/^\s*POM\s*Came with the keyboard\s*$/);
			await expect.element(items.nth(1)).not.toHaveTextContent('Came with the keyboard');
			await expect.element(items.nth(1)).toHaveTextContent('Aluminum · Silver · 1.5mm');
			await expect.element(items.nth(1)).toHaveTextContent('CannonKeys');
			await expect.element(items.nth(1)).toHaveTextContent('$40.00');
			await expect.element(items.nth(2)).toHaveTextContent('Hotswap · QMK');
		});

		it('shows the total cost next to the base price', async () => {
			await renderParts(true);

			await expect.element(page.getByText('Total cost')).toBeInTheDocument();
			await expect.element(page.getByText('$340.00')).toBeInTheDocument();
			await expect.element(page.getByText('Base price')).toBeInTheDocument();
			await expect.element(page.getByText('$300.00')).toBeInTheDocument();
		});

		it('hides part prices and the total along with the base price', async () => {
			await renderParts(false);

			await expect.element(page.getByText('CannonKeys')).toBeInTheDocument();
			await expect.element(page.getByText('$40.00')).not.toBeInTheDocument();
			await expect.element(page.getByText('Total cost')).not.toBeInTheDocument();
			await expect.element(page.getByText('Base price')).not.toBeInTheDocument();
		});
	});
});

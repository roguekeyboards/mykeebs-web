import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ECPartType, ImageStatus, type ECPart } from '@roguekeyboards/mykeebs-api-client';
import ECPartDetails from './ECPartDetails.svelte';

const BROKEN = 'data:image/png;base64,bm90IGFuIGltYWdl';
const IMAGE =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const domes: ECPart = {
	id: 'ec-1',
	brand: 'Deskeys',
	name: 'Silicone domes',
	partType: ECPartType.Domes,
	domes: { weight: 45, material: 'Silicone', color: 'Red' },
	purchases: [{ vendor: 'Deskeys', quantity: 110, price: 60, currency: 'USD' }]
};

function specRows() {
	return [...document.querySelectorAll('.spec-row')].map((row) =>
		[...row.children].map((cell) => cell.textContent?.trim())
	);
}

describe('ECPartDetails.svelte', () => {
	it('shows the part type and its own specs with units, then the purchase', async () => {
		await render(ECPartDetails, { part: domes, onImageClick: vi.fn(), showPrice: true });

		await expect.element(page.getByRole('heading', { name: 'Silicone domes' })).toBeInTheDocument();
		await expect.element(page.getByText('Domes', { exact: true })).toBeInTheDocument();
		expect(specRows()).toEqual(
			expect.arrayContaining([
				['Weight', '45g'],
				['Material', 'Silicone'],
				['Color', 'Red'],
				['Vendor', 'Deskeys'],
				['Quantity', '110']
			])
		);
	});

	it('lists every purchase of a restocked part under the total quantity', async () => {
		await render(ECPartDetails, {
			part: {
				...domes,
				purchases: [
					{ vendor: 'Deskeys', quantity: 110, orderStatus: 'Delivered' },
					{ vendor: 'Keebwerk', quantity: 40, orderStatus: 'Ordered' }
				],
				totalQuantity: 150,
				totalCost: 75,
				currency: 'USD'
			},
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect.element(page.getByRole('heading', { name: 'Purchases' })).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Purchase 2' })).toBeInTheDocument();
		expect(specRows()).toEqual(
			expect.arrayContaining([
				['Total quantity', '150'],
				['Total price', '$75.00'],
				['Vendor', 'Deskeys'],
				['Quantity', '110'],
				['Vendor', 'Keebwerk'],
				['Quantity', '40']
			])
		);
	});

	it('hides the total price when prices are hidden', async () => {
		await render(ECPartDetails, {
			part: {
				...domes,
				purchases: [{ quantity: 110 }, { quantity: 40 }],
				totalCost: 75,
				currency: 'USD'
			},
			onImageClick: vi.fn(),
			showPrice: false
		});

		await expect.element(page.getByRole('heading', { name: 'Purchases' })).toBeInTheDocument();
		expect(specRows().map(([label]) => label)).not.toContain('Total price');
	});

	it('leaves out the specs section when nothing is set', async () => {
		await render(ECPartDetails, {
			part: { ...domes, domes: {}, purchases: undefined },
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect.element(page.getByRole('heading', { name: 'Silicone domes' })).toBeInTheDocument();
		await expect.element(page.getByText('Specs')).not.toBeInTheDocument();
	});

	it('shows a ring thickness in millimetres', async () => {
		await render(ECPartDetails, {
			part: {
				...domes,
				partType: ECPartType.Rings,
				domes: undefined,
				rings: { thickness: 0.3 }
			},
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect.element(page.getByText('Silencing rings')).toBeInTheDocument();
		expect(specRows()).toContainEqual(['Thickness', '0.3mm']);
	});

	it('hides an image that fails to load and reports it', async () => {
		const onImageError = vi.fn();
		await render(ECPartDetails, {
			part: { ...domes, image: { url: BROKEN } },
			onImageClick: vi.fn(),
			onImageError,
			showPrice: true
		});

		await vi.waitFor(() => expect(onImageError).toHaveBeenCalledOnce());
		await expect.element(page.getByRole('img', { name: 'Silicone domes' })).not.toBeInTheDocument();
	});

	it('marks an image that is pending review', async () => {
		await render(ECPartDetails, {
			part: { ...domes, image: { url: IMAGE, status: ImageStatus.Pending } },
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
	});
});

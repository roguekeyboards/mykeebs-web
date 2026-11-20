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
	purchase: { vendor: 'Deskeys', quantity: 110, price: 60, currency: 'USD' }
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

	it('leaves out the specs section when nothing is set', async () => {
		await render(ECPartDetails, {
			part: { ...domes, domes: {}, purchase: undefined },
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

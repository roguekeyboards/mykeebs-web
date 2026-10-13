import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus, type KeycapSet } from '@rogueserenity/kbdb-api-client';
import KeycapSetDetails from './KeycapSetDetails.svelte';

const BROKEN = 'data:image/png;base64,bm90IGFuIGltYWdl';
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

function set(overrides: Partial<KeycapSet> = {}): KeycapSet {
	return {
		id: 's',
		brand: 'GMK',
		name: 'Olivia',
		primaryKitId: 'base',
		kits: [{ kitId: 'base', name: 'Base' }],
		totalCost: 51,
		currency: 'USD',
		...overrides
	};
}

function props(overrides: Partial<KeycapSet> = {}, showPrice = true) {
	return {
		set: set(overrides),
		failedImages: new Set<string>(),
		onImageError: vi.fn(),
		onKitClick: vi.fn(),
		showPrice
	};
}

describe('KeycapSetDetails.svelte', () => {
	it("shows the set's total cost", async () => {
		render(KeycapSetDetails, props());

		await expect.element(page.getByText('Total cost')).toBeInTheDocument();
		await expect.element(page.getByText('$51.00')).toBeInTheDocument();
	});

	it('labels the total with the currency kbdb returns', async () => {
		render(KeycapSetDetails, props({ totalCost: 40, currency: 'EUR' }));

		await expect.element(page.getByText('€40.00')).toBeInTheDocument();
	});

	it('hides the total when prices are hidden from this viewer', async () => {
		render(KeycapSetDetails, props({}, false));

		await expect.element(page.getByText('Total cost')).not.toBeInTheDocument();
	});

	it('hides the total when no kit has a price', async () => {
		render(KeycapSetDetails, props({ totalCost: undefined, currency: undefined }));

		await expect.element(page.getByText('Total cost')).not.toBeInTheDocument();
	});

	it("reports a kit image that fails to load with that image's URL", async () => {
		const p = props({ kits: [{ kitId: 'base', name: 'Base', image: { url: BROKEN } }] });
		render(KeycapSetDetails, p);

		await vi.waitFor(() => expect(p.onImageError).toHaveBeenCalledWith(BROKEN));
	});

	it('names a kit tile once, treating its photo as decoration', async () => {
		render(
			KeycapSetDetails,
			props({ kits: [{ kitId: 'base', name: 'Base', image: { url: PIXEL } }] })
		);

		const tile = page.getByRole('button', { name: /Base/ });
		await expect.element(tile).toBeInTheDocument();
		expect(tile.element().querySelector('img')?.getAttribute('alt')).toBe('');
		expect(tile.element().textContent?.match(/Base/g)).toHaveLength(1);
		await expect.element(page.getByRole('img', { name: 'Base' })).not.toBeInTheDocument();
	});
});

describe('KeycapSetDetails.svelte image moderation', () => {
	it('shows a rejected kit image by its reason and marks a pending one', async () => {
		render(
			KeycapSetDetails,
			props({
				kits: [
					{
						kitId: 'base',
						name: 'Base',
						image: { status: ImageStatus.Rejected, rejectionReason: 'Explicit' }
					},
					{ kitId: 'nov', name: 'Novelties', image: { url: PIXEL, status: ImageStatus.Pending } }
				]
			})
		);

		await expect
			.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
			.toBeInTheDocument();
		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
	});
});

import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus, type Switch } from '@rogueserenity/kbdb-api-client';
import SwitchDetails from './SwitchDetails.svelte';

const BROKEN = 'data:image/png;base64,bm90IGFuIGltYWdl';
const FRESH =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function sw(url: string): Switch {
	return { id: 'sw', brand: 'HMX', name: 'Aperol', type: 'Linear', image: { url } };
}

describe('SwitchDetails.svelte', () => {
	it('hides an image that fails to load and reports it', async () => {
		const onImageError = vi.fn();
		await render(SwitchDetails, {
			sw: sw(BROKEN),
			onImageClick: vi.fn(),
			onImageError,
			showPrice: true
		});

		await vi.waitFor(() => expect(onImageError).toHaveBeenCalledOnce());
		await expect.element(page.getByRole('img', { name: 'Aperol' })).not.toBeInTheDocument();
	});

	it('shows the image again once a refetch brings a fresh URL', async () => {
		const onImageError = vi.fn();
		const { rerender } = await render(SwitchDetails, {
			sw: sw(BROKEN),
			onImageClick: vi.fn(),
			onImageError,
			showPrice: true
		});
		await vi.waitFor(() => expect(onImageError).toHaveBeenCalledOnce());

		await rerender({ sw: sw(FRESH) });

		await expect.element(page.getByRole('img', { name: 'Aperol' })).toBeInTheDocument();
		expect(onImageError).toHaveBeenCalledOnce();
	});
});

describe('SwitchDetails.svelte image moderation', () => {
	it('marks an image that is pending review', async () => {
		await render(SwitchDetails, {
			sw: { ...sw(FRESH), image: { url: FRESH, status: ImageStatus.Pending } },
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
	});

	it('shows a rejected image by its reason', async () => {
		await render(SwitchDetails, {
			sw: {
				...sw(FRESH),
				image: { status: ImageStatus.Rejected, rejectionReason: 'unprocessable' }
			},
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect
			.element(page.getByRole('img', { name: "Photo couldn't be processed" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'View full size image', exact: false }))
			.not.toBeInTheDocument();
	});
});

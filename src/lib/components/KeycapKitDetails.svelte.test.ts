import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus } from '@roguekeyboards/kbdb-api-client';
import type { ModeratedImage } from '#lib/image-moderation.js';
import KeycapKitDetails from './KeycapKitDetails.svelte';

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

async function renderKit(image: ModeratedImage | undefined) {
	await render(KeycapKitDetails, {
		name: 'Base',
		image,
		imageFailed: false,
		onImageError: vi.fn(),
		onImageClick: vi.fn(),
		purchase: undefined,
		showPrice: true
	});
}

describe('KeycapKitDetails.svelte', () => {
	it('marks a photo that is pending review', async () => {
		await renderKit({ url: PIXEL, status: ImageStatus.Pending });

		await expect
			.element(page.getByRole('button', { name: 'View full size image, pending review' }))
			.toBeInTheDocument();
		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
	});

	it('shows a removed photo by its reason, with nothing to open full size', async () => {
		await renderKit({ status: ImageStatus.Rejected, rejectionReason: 'Explicit' });

		await expect
			.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /View full size image/ }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('No image')).not.toBeInTheDocument();
	});

	it('still says there is no image when the kit has none', async () => {
		await renderKit(undefined);

		await expect.element(page.getByText('No image')).toBeInTheDocument();
	});
});

import { describe, expect, it } from 'vitest';
import { ImageStatus, ResponseError } from '@rogueserenity/kbdb-api-client';
import {
	anyPending,
	isPending,
	rejectionText,
	UPLOADS_UNAVAILABLE,
	uploadErrorMessage,
	viewableImages
} from './image-moderation';

describe('viewableImages', () => {
	it('drops rejected images, which have no url, and keeps order', () => {
		const images = [
			{ imageId: 'a', url: 'https://a', status: ImageStatus.Approved },
			{ imageId: 'b', status: ImageStatus.Rejected, rejectionReason: 'Explicit' },
			{ imageId: 'c', url: 'https://c', status: ImageStatus.Pending }
		];

		expect(viewableImages(images).map((image) => image.imageId)).toEqual(['a', 'c']);
	});

	it('keeps images without a status, as non-owners see them', () => {
		expect(viewableImages([{ imageId: 'a', url: 'https://a' }])).toHaveLength(1);
	});

	it('is empty for no images', () => {
		expect(viewableImages(undefined)).toEqual([]);
	});
});

describe('isPending / anyPending', () => {
	it('is true only for a pending status', () => {
		expect(isPending({ status: ImageStatus.Pending })).toBe(true);
		expect(isPending({ status: ImageStatus.Approved })).toBe(false);
		expect(isPending({ url: 'https://a' })).toBe(false);
		expect(isPending(undefined)).toBe(false);
	});

	it('finds a pending image among others', () => {
		expect(anyPending([{ status: ImageStatus.Approved }, { status: ImageStatus.Pending }])).toBe(
			true
		);
		expect(anyPending([{ status: ImageStatus.Approved }, undefined])).toBe(false);
		expect(anyPending(undefined)).toBe(false);
	});
});

describe('rejectionText', () => {
	it('names the moderation label', () => {
		expect(rejectionText('Explicit')).toBe('Removed by moderation: Explicit');
	});

	it('explains an unprocessable file', () => {
		expect(rejectionText('unprocessable')).toBe("Couldn't be processed");
	});

	it('still says removed without a reason', () => {
		expect(rejectionText(undefined)).toBe('Removed by moderation');
	});
});

describe('uploadErrorMessage', () => {
	const responseError = (status: number) => new ResponseError(new Response(null, { status }));

	it('says uploads are unavailable on a 429', () => {
		expect(uploadErrorMessage(responseError(429))).toBe(UPLOADS_UNAVAILABLE);
	});

	it('is generic for anything else', () => {
		expect(uploadErrorMessage(responseError(500))).toBe('Could not upload that image.');
		expect(uploadErrorMessage(new Error('upload failed: 403'))).toBe(
			'Could not upload that image.'
		);
	});
});

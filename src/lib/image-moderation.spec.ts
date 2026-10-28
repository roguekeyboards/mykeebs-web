import { describe, expect, it } from 'vitest';
import { ImageStatus, ResponseError } from '@rogueserenity/kbdb-api-client';
import {
	anyPending,
	isPending,
	primaryImageUrl,
	rejectionText,
	UPLOADS_UNAVAILABLE,
	uploadErrorMessage,
	viewableImages
} from './image-moderation';
import { ImageTooLargeError, UnsupportedImageError } from './image-errors';

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

describe('primaryImageUrl', () => {
	it('is the first image', () => {
		expect(primaryImageUrl([{ url: 'first.png' }, { url: 'second.png' }])).toBe('first.png');
	});

	it('skips a rejected image, which has no url', () => {
		expect(
			primaryImageUrl([
				{ status: ImageStatus.Rejected, rejectionReason: 'Explicit' },
				{ url: 'second.png', status: ImageStatus.Pending }
			])
		).toBe('second.png');
	});

	it('is undefined with no viewable image', () => {
		expect(primaryImageUrl([])).toBeUndefined();
		expect(primaryImageUrl(undefined)).toBeUndefined();
		expect(primaryImageUrl([{ status: ImageStatus.Rejected }])).toBeUndefined();
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
	const responseError = (status: number, contentType = 'application/json') =>
		new ResponseError(new Response(null, { status, headers: { 'Content-Type': contentType } }));

	it("says uploads are unavailable on kbdb's upload-cap 429", () => {
		expect(uploadErrorMessage(responseError(429, 'application/problem+json'))).toBe(
			UPLOADS_UNAVAILABLE
		);
	});

	it("doesn't mistake API Gateway's throttle 429 for the upload cap", () => {
		expect(uploadErrorMessage(responseError(429))).toBe('Could not upload that image.');
	});

	it("explains an image that can't be uploaded at all", () => {
		expect(uploadErrorMessage(new UnsupportedImageError())).toBe(
			"This browser can't read that image format. Try a JPEG, PNG or WebP."
		);
		expect(uploadErrorMessage(new ImageTooLargeError())).toBe(
			'This photo is too detailed to fit under 1.5 MB, even shrunk. Try a different one.'
		);
	});

	it('is generic for anything else', () => {
		expect(uploadErrorMessage(responseError(500))).toBe('Could not upload that image.');
		expect(uploadErrorMessage(new Error('upload failed: 403'))).toBe(
			'Could not upload that image.'
		);
	});
});

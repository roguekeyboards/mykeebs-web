import { describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES } from './image-errors';
import {
	encodeWithinCap,
	fitWithin,
	MAX_EDGE,
	MIN_EDGE,
	MIN_QUALITY,
	NEAR_CAP_QUALITY,
	WEBP_QUALITY,
	webpName
} from './image-resize';

describe('fitWithin', () => {
	it('scales a landscape image so its width is the max edge', () => {
		expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1920 });
	});

	it('scales a portrait image so its height is the max edge', () => {
		expect(fitWithin(3024, 4032)).toEqual({ width: 1920, height: MAX_EDGE });
	});

	it('never enlarges an image already within the max edge', () => {
		expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
	});

	it('keeps an image exactly at the max edge unchanged', () => {
		expect(fitWithin(MAX_EDGE, 100)).toEqual({ width: MAX_EDGE, height: 100 });
	});

	it('never rounds a thin side down to zero', () => {
		expect(fitWithin(100000, 10)).toEqual({ width: MAX_EDGE, height: 1 });
	});
});

describe('webpName', () => {
	it('swaps the extension for .webp', () => {
		expect(webpName('IMG_1234.HEIC')).toBe('IMG_1234.webp');
	});

	it('only replaces the last extension', () => {
		expect(webpName('kit.base.png')).toBe('kit.base.webp');
	});

	it('adds .webp when there is no extension', () => {
		expect(webpName('photo')).toBe('photo.webp');
	});

	it('falls back to a name when the original is only an extension', () => {
		expect(webpName('.png')).toBe('image.webp');
	});
});

describe('encodeWithinCap', () => {
	const ofSize = (bytes: number) => new ArrayBuffer(bytes);

	// Bytes per pixel times the pixels at that edge, with a fixed size per quality.
	const encoder = (sizeAtMaxEdge: Record<number, number>) =>
		vi.fn(async (quality: number, maxEdge: number) =>
			ofSize(Math.round(sizeAtMaxEdge[quality] * (maxEdge / MAX_EDGE) ** 2))
		);

	it('encodes once at the usual quality when that fits', async () => {
		const encode = encoder({ [WEBP_QUALITY]: MAX_IMAGE_BYTES });

		const webp = await encodeWithinCap(encode, MAX_EDGE);

		expect(webp.byteLength).toBe(MAX_IMAGE_BYTES);
		expect(encode.mock.calls).toEqual([[WEBP_QUALITY, MAX_EDGE]]);
	});

	it('tries a small quality drop first when only just over', async () => {
		const encode = encoder({
			[WEBP_QUALITY]: MAX_IMAGE_BYTES * 1.1,
			[NEAR_CAP_QUALITY]: MAX_IMAGE_BYTES * 0.95
		});

		await encodeWithinCap(encode, MAX_EDGE);

		expect(encode.mock.calls).toEqual([
			[WEBP_QUALITY, MAX_EDGE],
			[NEAR_CAP_QUALITY, MAX_EDGE]
		]);
	});

	it('drops to the lowest quality when the small drop is not enough', async () => {
		const encode = encoder({
			[WEBP_QUALITY]: MAX_IMAGE_BYTES * 1.1,
			[NEAR_CAP_QUALITY]: MAX_IMAGE_BYTES * 1.05,
			[MIN_QUALITY]: MAX_IMAGE_BYTES * 0.9
		});

		await encodeWithinCap(encode, MAX_EDGE);

		expect(encode.mock.calls.map(([quality]) => quality)).toEqual([
			WEBP_QUALITY,
			NEAR_CAP_QUALITY,
			MIN_QUALITY
		]);
	});

	it('goes straight to the lowest quality when well over', async () => {
		const encode = encoder({
			[WEBP_QUALITY]: MAX_IMAGE_BYTES * 1.3,
			[MIN_QUALITY]: MAX_IMAGE_BYTES * 0.9
		});

		await encodeWithinCap(encode, MAX_EDGE);

		expect(encode.mock.calls.map(([quality]) => quality)).toEqual([WEBP_QUALITY, MIN_QUALITY]);
	});

	it('shrinks just enough to fit, with room to spare, at the lowest quality', async () => {
		const encode = encoder({
			[WEBP_QUALITY]: MAX_IMAGE_BYTES * 2,
			[MIN_QUALITY]: MAX_IMAGE_BYTES * 1.5
		});

		const webp = await encodeWithinCap(encode, MAX_EDGE);

		expect(encode).toHaveBeenCalledTimes(3);
		const [quality, edge] = encode.mock.calls[2];
		expect(quality).toBe(MIN_QUALITY);
		expect(edge).toBe(Math.floor(MAX_EDGE * Math.sqrt(0.9 / 1.5)));
		expect(webp.byteLength).toBeLessThanOrEqual(MAX_IMAGE_BYTES * 0.9);
	});

	it('shrinks no further than the minimum edge, even if that still does not fit', async () => {
		const encode = encoder({
			[WEBP_QUALITY]: MAX_IMAGE_BYTES * 8,
			[MIN_QUALITY]: MAX_IMAGE_BYTES * 6
		});

		const webp = await encodeWithinCap(encode, MAX_EDGE);

		expect(encode.mock.calls[2]).toEqual([MIN_QUALITY, MIN_EDGE]);
		expect(webp.byteLength).toBeGreaterThan(MAX_IMAGE_BYTES);
	});

	it('does not shrink an image already at the minimum edge', async () => {
		const encode = encoder({
			[WEBP_QUALITY]: MAX_IMAGE_BYTES * 8,
			[MIN_QUALITY]: MAX_IMAGE_BYTES * 6
		});

		await encodeWithinCap(encode, MIN_EDGE);

		expect(encode.mock.calls.map(([, edge]) => edge)).toEqual([MIN_EDGE, MIN_EDGE]);
	});
});

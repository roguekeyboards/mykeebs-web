import { MAX_IMAGE_BYTES, UnsupportedImageError } from './image-errors';

export const MAX_EDGE = 2560;
export const WEBP_QUALITY = 82;
export const NEAR_CAP_QUALITY = 77;
export const MIN_QUALITY = 72;
export const MIN_EDGE = 1600;

export function fitWithin(
	width: number,
	height: number,
	maxEdge = MAX_EDGE
): { width: number; height: number } {
	const scale = Math.min(1, maxEdge / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

export function webpName(name: string): string {
	const base = name.replace(/\.[^./]*$/, '');
	return `${base || 'image'}.webp`;
}

export async function prepareImage(file: File): Promise<File> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		throw new UnsupportedImageError();
	}

	let full: ImageData;
	try {
		full = draw(bitmap, MAX_EDGE);
	} finally {
		bitmap.close();
	}

	const { default: encode } = await import('@jsquash/webp/encode');
	const longEdge = Math.max(full.width, full.height);
	const webp = await encodeWithinCap(
		(quality, maxEdge) => encode(maxEdge < longEdge ? shrink(full, maxEdge) : full, { quality }),
		longEdge
	);
	return new File([webp], webpName(file.name), { type: 'image/webp' });
}

function draw(source: ImageBitmap | OffscreenCanvas, maxEdge: number): ImageData {
	const { width, height } = fitWithin(source.width, source.height, maxEdge);
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2d canvas unavailable');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, 0, 0, width, height);
	return ctx.getImageData(0, 0, width, height);
}

function shrink(pixels: ImageData, maxEdge: number): ImageData {
	const canvas = new OffscreenCanvas(pixels.width, pixels.height);
	canvas.getContext('2d')?.putImageData(pixels, 0, 0);
	return draw(canvas, maxEdge);
}

export async function encodeWithinCap(
	encode: (quality: number, maxEdge: number) => Promise<ArrayBuffer>,
	longEdge: number
): Promise<ArrayBuffer> {
	let webp = await encode(WEBP_QUALITY, longEdge);
	if (webp.byteLength <= MAX_IMAGE_BYTES) return webp;

	const qualities =
		webp.byteLength <= MAX_IMAGE_BYTES * 1.15 ? [NEAR_CAP_QUALITY, MIN_QUALITY] : [MIN_QUALITY];
	for (const quality of qualities) {
		webp = await encode(quality, longEdge);
		if (webp.byteLength <= MAX_IMAGE_BYTES) return webp;
	}

	const fit = Math.floor(longEdge * Math.sqrt((0.9 * MAX_IMAGE_BYTES) / webp.byteLength));
	const shrunk = Math.max(MIN_EDGE, fit);
	return shrunk < longEdge ? encode(MIN_QUALITY, shrunk) : webp;
}

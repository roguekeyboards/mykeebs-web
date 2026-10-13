export const MAX_EDGE = 2560;
export const WEBP_QUALITY = 82;

export class UnsupportedImageError extends Error {
	constructor() {
		super('This image format is not supported.');
		this.name = 'UnsupportedImageError';
	}
}

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

	const { width, height } = fitWithin(bitmap.width, bitmap.height);
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2d canvas unavailable');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const { default: encode } = await import('@jsquash/webp/encode');
	const webp = await encode(ctx.getImageData(0, 0, width, height), { quality: WEBP_QUALITY });
	return new File([webp], webpName(file.name), { type: 'image/webp' });
}

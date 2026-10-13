import { describe, expect, it } from 'vitest';
import { MAX_EDGE, prepareImage, UnsupportedImageError } from './image-resize';

async function canvasFile(
	width: number,
	height: number,
	type: 'image/png' | 'image/jpeg',
	draw: (ctx: OffscreenCanvasRenderingContext2D) => void
): Promise<File> {
	const canvas = new OffscreenCanvas(width, height);
	draw(canvas.getContext('2d')!);
	const blob = await canvas.convertToBlob({ type });
	return new File([blob], type === 'image/png' ? 'pic.png' : 'pic.jpg', { type });
}

const fill = (color: string) => (ctx: OffscreenCanvasRenderingContext2D) => {
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
};

// An APP1 segment whose only tag is Orientation = 6 (rotate 90° clockwise).
const EXIF_ROTATE_90 = new Uint8Array([
	0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00,
	0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00
]);

async function withExifRotation(jpeg: File): Promise<File> {
	const bytes = new Uint8Array(await jpeg.arrayBuffer());
	const out = new Uint8Array(bytes.length + EXIF_ROTATE_90.length);
	out.set(bytes.subarray(0, 2));
	out.set(EXIF_ROTATE_90, 2);
	out.set(bytes.subarray(2), 2 + EXIF_ROTATE_90.length);
	return new File([out], 'rotated.jpg', { type: 'image/jpeg' });
}

async function pixels(file: File) {
	const bitmap = await createImageBitmap(file);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0);
	return {
		width: bitmap.width,
		height: bitmap.height,
		data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
	};
}

describe('prepareImage', () => {
	it('re-encodes as WebP with a .webp name', async () => {
		const prepared = await prepareImage(await canvasFile(40, 30, 'image/png', fill('#c33')));

		expect(prepared.type).toBe('image/webp');
		expect(prepared.name).toBe('pic.webp');
		const { width, height } = await pixels(prepared);
		expect([width, height]).toEqual([40, 30]);
	});

	it('shrinks a large image so its long edge is the max edge, keeping the aspect ratio', async () => {
		const large = await canvasFile(3000, 2000, 'image/png', fill('#36c'));

		const { width, height } = await pixels(await prepareImage(large));

		expect([width, height]).toEqual([MAX_EDGE, 1707]);
	});

	it('applies the EXIF rotation so phone photos stay upright', async () => {
		const sideways = await withExifRotation(await canvasFile(40, 20, 'image/jpeg', fill('#3a3')));

		const { width, height } = await pixels(await prepareImage(sideways));

		expect([width, height]).toEqual([20, 40]);
	});

	it('keeps transparent areas transparent', async () => {
		const halfClear = await canvasFile(20, 10, 'image/png', (ctx) => {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, 10, 10);
		});

		const { width, data } = await pixels(await prepareImage(halfClear));
		const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];

		expect(alphaAt(2, 5)).toBe(255);
		expect(alphaAt(17, 5)).toBe(0);
	});

	it('rejects a file the browser cannot decode', async () => {
		const heic = new File(['not really an image'], 'IMG_0001.HEIC', { type: 'image/heic' });

		await expect(prepareImage(heic)).rejects.toBeInstanceOf(UnsupportedImageError);
	});
});

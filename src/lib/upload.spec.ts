import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadImage, uploadToSignedUrl } from './upload';

const file = new File(['png'], 'a.png', { type: 'image/png' });

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('uploadToSignedUrl', () => {
	it('PUTs the file with its content type to the signed URL', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await uploadToSignedUrl('https://bucket.example/signed', file);

		expect(fetchMock).toHaveBeenCalledWith('https://bucket.example/signed', {
			method: 'PUT',
			headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
			body: file
		});
	});

	it('throws when the storage service rejects the upload', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 403 }))
		);

		await expect(uploadToSignedUrl('https://bucket.example/signed', file)).rejects.toThrow(
			'upload failed: 403'
		);
	});
});

describe('uploadImage', () => {
	const webp = new File(['converted webp'], 'a.webp', { type: 'image/webp' });

	it('uploads the prepared image, asking for a URL with its type and exact size', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const prepare = vi.fn(async () => webp);
		const requestUpload = vi.fn(async () => ({ uploadUrl: 'https://bucket.example/signed' }));

		await uploadImage(file, requestUpload, prepare);

		expect(prepare).toHaveBeenCalledWith(file);
		expect(webp.size).not.toBe(file.size);
		expect(requestUpload).toHaveBeenCalledWith({ contentType: 'image/webp', sizeBytes: webp.size });
		expect(fetchMock).toHaveBeenCalledWith('https://bucket.example/signed', {
			method: 'PUT',
			headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*' },
			body: webp
		});
	});

	it('asks for no upload URL when the image cannot be prepared', async () => {
		const requestUpload = vi.fn(async () => ({ uploadUrl: 'https://bucket.example/signed' }));

		await expect(
			uploadImage(file, requestUpload, async () => {
				throw new Error('undecodable');
			})
		).rejects.toThrow('undecodable');
		expect(requestUpload).not.toHaveBeenCalled();
	});
});

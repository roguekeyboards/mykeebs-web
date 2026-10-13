import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseError } from '@rogueserenity/kbdb-api-client';
import {
	stagedUploadMessage,
	stagedUploadOutcome,
	uploadImage,
	uploadStaged,
	uploadToSignedUrl
} from './upload';

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

describe('uploadStaged', () => {
	const files = ['a', 'b', 'c'].map(
		(name) => new File([name], `${name}.png`, { type: 'image/png' })
	);
	const unavailable = () => new ResponseError(new Response(null, { status: 429 }));

	it('uploads every file in order and reports nothing when all succeed', async () => {
		const upload = vi.fn<(file: File) => Promise<void>>(async () => {});

		expect(await uploadStaged(files, upload)).toBeNull();
		expect(upload.mock.calls.map(([f]) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
	});

	it('keeps going past an ordinary failure and counts it', async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name === 'b.png') throw new Error('upload failed: 403');
		});

		expect(await uploadStaged(files, upload)).toEqual({
			failed: 1,
			total: 3,
			unavailable: false
		});
		expect(upload).toHaveBeenCalledTimes(3);
	});

	it('stops at a 429 and counts the rest as failed', async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name === 'b.png') throw unavailable();
		});

		expect(await uploadStaged(files, upload)).toEqual({
			failed: 2,
			total: 3,
			unavailable: true
		});
		expect(upload).toHaveBeenCalledTimes(2);
	});
});

describe('stagedUploadMessage', () => {
	it('says uploads are unavailable after a 429', () => {
		expect(stagedUploadMessage('keyboard', { failed: 2, total: 2, unavailable: true })).toBe(
			"The keyboard was added, but its photos weren't. Uploads unavailable, try again later."
		);
	});

	it('counts the photos when only some failed', () => {
		expect(stagedUploadMessage('build', { failed: 1, total: 3, unavailable: false })).toBe(
			"The build was added, but 1 of its 3 photos wasn't. Add it again."
		);
		expect(stagedUploadMessage('build', { failed: 2, total: 3, unavailable: true })).toBe(
			"The build was added, but 2 of its 3 photos weren't. Uploads unavailable, try again later."
		);
	});

	it('speaks of a single photo', () => {
		expect(stagedUploadMessage('switch', { failed: 1, total: 1, unavailable: false })).toBe(
			"The switch was added, but its photo wasn't. Add it again."
		);
	});
});

describe('stagedUploadOutcome', () => {
	it('does nothing when every photo uploaded', () => {
		expect(stagedUploadOutcome('switch', null, true)).toEqual({ reopen: false, message: null });
	});

	it('reopens the item after an ordinary failure, where it can', () => {
		const failure = { failed: 1, total: 1, unavailable: false };

		expect(stagedUploadOutcome('switch', failure, true)).toEqual({
			reopen: true,
			message: "The switch was added, but its photo wasn't. Add it again."
		});
		expect(stagedUploadOutcome('build', failure, false).reopen).toBe(false);
	});

	it("doesn't reopen after a 429, since retrying won't help", () => {
		expect(stagedUploadOutcome('switch', { failed: 1, total: 1, unavailable: true }, true)).toEqual(
			{
				reopen: false,
				message: "The switch was added, but its photo wasn't. Uploads unavailable, try again later."
			}
		);
	});
});

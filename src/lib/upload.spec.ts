import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseError } from '@roguekeyboards/kbdb-api-client';
import {
	stagedUploadFollowUp,
	stagedUploadMessage,
	pickedUploadMessage,
	stagedUploadOutcome,
	uploadImage,
	uploadEach,
	uploadToSignedUrl
} from './upload';
import { ImageTooLargeError, MAX_IMAGE_BYTES, UnsupportedImageError } from './image-errors';

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

describe('uploadImage size cap', () => {
	const ofSize = (bytes: number) =>
		new File([new Uint8Array(bytes)], 'a.webp', { type: 'image/webp' });

	it('asks for no upload URL when the prepared image is over 1.5 MB', async () => {
		const requestUpload = vi.fn(async () => ({ uploadUrl: 'https://bucket.example/signed' }));

		await expect(
			uploadImage(file, requestUpload, async () => ofSize(MAX_IMAGE_BYTES + 1))
		).rejects.toBeInstanceOf(ImageTooLargeError);
		expect(requestUpload).not.toHaveBeenCalled();
	});

	it('uploads an image of exactly 1.5 MB', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 }))
		);
		const requestUpload = vi.fn(async () => ({ uploadUrl: 'https://bucket.example/signed' }));

		await uploadImage(file, requestUpload, async () => ofSize(MAX_IMAGE_BYTES));

		expect(requestUpload).toHaveBeenCalledWith({
			contentType: 'image/webp',
			sizeBytes: 1_572_864
		});
	});
});

describe('uploadEach', () => {
	const files = ['a', 'b', 'c'].map(
		(name) => new File([name], `${name}.png`, { type: 'image/png' })
	);
	const unavailable = () =>
		new ResponseError(
			new Response(null, { status: 429, headers: { 'Content-Type': 'application/problem+json' } })
		);

	it('uploads every file in order and reports nothing when all succeed', async () => {
		const upload = vi.fn<(file: File) => Promise<void>>(async () => {});

		expect(await uploadEach(files, upload)).toBeNull();
		expect(upload.mock.calls.map(([f]) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
	});

	it('keeps going past an ordinary failure and counts it', async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name === 'b.png') throw new Error('upload failed: 403');
		});

		expect(await uploadEach(files, upload)).toEqual({
			failed: 1,
			tooLarge: 0,
			unsupported: 0,
			total: 3,
			unavailable: false
		});
		expect(upload).toHaveBeenCalledTimes(3);
	});

	it('counts the photos that were too large', async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name !== 'b.png') throw new ImageTooLargeError();
		});

		expect(await uploadEach(files, upload)).toEqual({
			failed: 2,
			tooLarge: 2,
			unsupported: 0,
			total: 3,
			unavailable: false
		});
	});

	it('counts the photos in a format that is not supported', async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name === 'a.png') throw new UnsupportedImageError();
			if (f.name === 'b.png') throw new ImageTooLargeError();
		});

		expect(await uploadEach(files, upload)).toEqual({
			failed: 2,
			tooLarge: 1,
			unsupported: 1,
			total: 3,
			unavailable: false
		});
	});

	it("counts API Gateway's throttle 429 as an ordinary failure, not the upload cap", async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name === 'a.png')
				throw new ResponseError(
					new Response(null, { status: 429, headers: { 'Content-Type': 'application/json' } })
				);
		});

		expect(await uploadEach(files, upload)).toEqual({
			failed: 1,
			tooLarge: 0,
			unsupported: 0,
			total: 3,
			unavailable: false
		});
		expect(upload).toHaveBeenCalledTimes(3);
	});

	it('stops at a 429 and counts the rest as failed', async () => {
		const upload = vi.fn(async (f: File) => {
			if (f.name === 'b.png') throw unavailable();
		});

		expect(await uploadEach(files, upload)).toEqual({
			failed: 2,
			tooLarge: 0,
			unsupported: 0,
			total: 3,
			unavailable: true
		});
		expect(upload).toHaveBeenCalledTimes(2);
	});
});

describe('stagedUploadMessage', () => {
	it('says uploads are unavailable after a 429', () => {
		expect(
			stagedUploadMessage('keyboard', {
				failed: 2,
				tooLarge: 0,
				unsupported: 0,
				total: 2,
				unavailable: true
			})
		).toBe("The keyboard was added, but its photos weren't. Uploads unavailable, try again later.");
	});

	it('counts the photos when only some failed', () => {
		expect(
			stagedUploadMessage('build', {
				failed: 1,
				tooLarge: 0,
				unsupported: 0,
				total: 3,
				unavailable: false
			})
		).toBe("The build was added, but 1 of its 3 photos wasn't. Add it again.");
		expect(
			stagedUploadMessage('build', {
				failed: 2,
				tooLarge: 0,
				unsupported: 0,
				total: 3,
				unavailable: true
			})
		).toBe(
			"The build was added, but 2 of its 3 photos weren't. Uploads unavailable, try again later."
		);
	});

	it('speaks of a single photo', () => {
		expect(
			stagedUploadMessage('switch', {
				failed: 1,
				tooLarge: 0,
				unsupported: 0,
				total: 1,
				unavailable: false
			})
		).toBe("The switch was added, but its photo wasn't. Add it again.");
	});
});

describe('stagedUploadMessage for photos over 1.5 MB', () => {
	it('asks for a smaller photo instead of the same one again', () => {
		expect(
			stagedUploadMessage('switch', {
				failed: 1,
				tooLarge: 1,
				unsupported: 0,
				total: 1,
				unavailable: false
			})
		).toBe(
			"The switch was added, but its photo wasn't. It's too detailed to fit under 1.5 MB. Add a different one."
		);
		expect(
			stagedUploadMessage(
				'build',
				{ failed: 2, tooLarge: 2, unsupported: 0, total: 3, unavailable: false },
				false
			)
		).toBe(
			"The build was added, but 2 of its 3 photos weren't. They're too detailed to fit under 1.5 MB. Add different ones by editing the build."
		);
	});

	it('names the large ones among other failures', () => {
		expect(
			stagedUploadMessage('build', {
				failed: 3,
				tooLarge: 1,
				unsupported: 0,
				total: 3,
				unavailable: false
			})
		).toBe(
			"The build was added, but its photos weren't. 1 was too detailed to fit under 1.5 MB. Add them again, with a different photo for that one."
		);
	});

	it('speaks of several large ones among other failures', () => {
		expect(
			stagedUploadMessage('build', {
				failed: 3,
				tooLarge: 2,
				unsupported: 0,
				total: 3,
				unavailable: false
			})
		).toBe(
			"The build was added, but its photos weren't. 2 were too detailed to fit under 1.5 MB. Add them again, with a different photo for those."
		);
	});

	it('keeps the reasons for photos already refused before a 429', () => {
		expect(
			stagedUploadMessage('keyboard', {
				failed: 2,
				tooLarge: 1,
				unsupported: 0,
				total: 2,
				unavailable: true
			})
		).toBe(
			"The keyboard was added, but its photos weren't. 1 was too detailed to fit under 1.5 MB. Uploads unavailable, try again later."
		);
	});
});

describe('stagedUploadMessage for photos in an unsupported format', () => {
	it('asks for a different photo', () => {
		expect(
			stagedUploadMessage('switch', {
				failed: 1,
				tooLarge: 0,
				unsupported: 1,
				total: 1,
				unavailable: false
			})
		).toBe(
			"The switch was added, but its photo wasn't. It's in a format this browser can't read. Add a different one."
		);
	});

	it('gives each reason when the photos failed for different ones', () => {
		expect(
			stagedUploadMessage('build', {
				failed: 3,
				tooLarge: 1,
				unsupported: 1,
				total: 4,
				unavailable: false
			})
		).toBe(
			"The build was added, but 3 of its 4 photos weren't. 1 was too detailed to fit under 1.5 MB. 1 was in a format this browser can't read. Add them again, with a different photo for those."
		);
	});
});

describe('pickedUploadMessage', () => {
	const failure = { failed: 1, tooLarge: 0, unsupported: 0, total: 1, unavailable: false };

	it('speaks of the one photo picked', () => {
		expect(pickedUploadMessage(failure)).toBe("That photo wasn't added. Add it again.");
		expect(pickedUploadMessage({ ...failure, tooLarge: 1 })).toBe(
			"That photo wasn't added. It's too detailed to fit under 1.5 MB. Add a different one."
		);
	});

	it('counts the photos when only some of a pick failed', () => {
		expect(pickedUploadMessage({ ...failure, tooLarge: 1, total: 4 })).toBe(
			"1 of 4 photos wasn't added. It's too detailed to fit under 1.5 MB. Add a different one."
		);
		expect(pickedUploadMessage({ ...failure, failed: 2, total: 4 })).toBe(
			"2 of 4 photos weren't added. Add them again."
		);
	});

	it('speaks of the whole pick when every photo failed', () => {
		expect(pickedUploadMessage({ ...failure, failed: 2, unsupported: 2, total: 2 })).toBe(
			"Those photos weren't added. They're in a format this browser can't read. Add different ones."
		);
	});

	it('keeps the reason for a photo refused before a 429 in a pick', () => {
		expect(
			pickedUploadMessage({ ...failure, failed: 3, unsupported: 1, total: 3, unavailable: true })
		).toBe(
			"Those photos weren't added. 1 was in a format this browser can't read. Uploads unavailable, try again later."
		);
	});

	it('keeps the reason for a photo refused before a 429 in a pick', () => {
		expect(
			pickedUploadMessage({ ...failure, failed: 3, unsupported: 1, total: 3, unavailable: true })
		).toBe(
			"Those photos weren't added. 1 was in a format this browser can't read. Uploads unavailable, try again later."
		);
	});

	it('says uploads are unavailable after a 429', () => {
		expect(pickedUploadMessage({ ...failure, failed: 2, total: 2, unavailable: true })).toBe(
			"Those photos weren't added. Uploads unavailable, try again later."
		);
	});
});

describe('stagedUploadOutcome', () => {
	it('does nothing when every photo uploaded', () => {
		expect(stagedUploadOutcome('switch', null, true)).toEqual({ reopen: false, message: null });
	});

	it('reopens the item after an ordinary failure, where it can', () => {
		const failure = { failed: 1, tooLarge: 0, unsupported: 0, total: 1, unavailable: false };

		expect(stagedUploadOutcome('switch', failure, true)).toEqual({
			reopen: true,
			message: "The switch was added, but its photo wasn't. Add it again."
		});
		expect(stagedUploadOutcome('build', failure, false)).toEqual({
			reopen: false,
			message: "The build was added, but its photo wasn't. Add it again by editing the build."
		});
	});

	it("doesn't reopen after a 429, since retrying won't help", () => {
		expect(
			stagedUploadOutcome(
				'switch',
				{ failed: 1, tooLarge: 0, unsupported: 0, total: 1, unavailable: true },
				true
			)
		).toEqual({
			reopen: false,
			message: "The switch was added, but its photo wasn't. Uploads unavailable, try again later."
		});
	});
});

describe('stagedUploadFollowUp', () => {
	it('follows on from another failure in the same create', () => {
		expect(
			stagedUploadFollowUp({ failed: 1, tooLarge: 0, unsupported: 0, total: 1, unavailable: false })
		).toBe("Its photo wasn't added either. Add it again.");
		expect(
			stagedUploadFollowUp({ failed: 2, tooLarge: 0, unsupported: 0, total: 3, unavailable: true })
		).toBe("2 of its 3 photos weren't added either. Uploads unavailable, try again later.");
	});
});

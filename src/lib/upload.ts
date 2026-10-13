import type { ImageUploadRequest } from '@rogueserenity/kbdb-api-client';
import { isUploadsUnavailable, UPLOADS_UNAVAILABLE } from './image-moderation';
import { prepareImage } from './image-resize';

export async function uploadToSignedUrl(uploadUrl: string, file: File): Promise<void> {
	const put = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'Content-Type': file.type, 'If-None-Match': '*' },
		body: file
	});
	if (!put.ok) throw new Error(`upload failed: ${put.status}`);
}

export async function uploadImage(
	file: File,
	requestUpload: (request: ImageUploadRequest) => Promise<{ uploadUrl: string }>,
	prepare: (file: File) => Promise<File> = prepareImage
): Promise<void> {
	const image = await prepare(file);
	const { uploadUrl } = await requestUpload({ contentType: image.type, sizeBytes: image.size });
	await uploadToSignedUrl(uploadUrl, image);
}

export type StagedUploadFailure = { failed: number; total: number; unavailable: boolean };

// For photos picked before their item existed: the item is already saved, so a
// failure here is reported, not thrown. After a 429 every remaining upload
// would be refused too, so they aren't attempted.
export async function uploadStaged(
	files: File[],
	upload: (file: File) => Promise<void>
): Promise<StagedUploadFailure | null> {
	let failed = 0;
	for (const [index, file] of files.entries()) {
		try {
			await upload(file);
		} catch (err) {
			if (isUploadsUnavailable(err)) {
				return { failed: failed + files.length - index, total: files.length, unavailable: true };
			}
			failed++;
		}
	}
	return failed > 0 ? { failed, total: files.length, unavailable: false } : null;
}

export function stagedUploadMessage(noun: string, failure: StagedUploadFailure): string {
	const { failed, total, unavailable } = failure;
	const what =
		failed < total
			? `${failed} of its ${total} photos ${failed === 1 ? "wasn't" : "weren't"}`
			: total === 1
				? "its photo wasn't"
				: "its photos weren't";
	const next = unavailable ? UPLOADS_UNAVAILABLE : `Add ${failed === 1 ? 'it' : 'them'} again.`;
	return `The ${noun} was added, but ${what}. ${next}`;
}

// After an ordinary failure the new item reopens for editing so the photos can
// be added again; after a 429 retrying won't help, so the page closes with a notice.
export function stagedUploadOutcome(
	noun: string,
	failure: StagedUploadFailure | null,
	canReopen: boolean
): { reopen: boolean; message: string | null } {
	if (!failure) return { reopen: false, message: null };
	return {
		reopen: canReopen && !failure.unavailable,
		message: stagedUploadMessage(noun, failure)
	};
}

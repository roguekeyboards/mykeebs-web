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

function missingPhotos({ failed, total }: StagedUploadFailure): string {
	if (failed < total)
		return `${failed} of its ${total} photos ${failed === 1 ? "wasn't" : "weren't"}`;
	return total === 1 ? "its photo wasn't" : "its photos weren't";
}

function nextStep(noun: string, { failed, unavailable }: StagedUploadFailure, canReopen: boolean) {
	if (unavailable) return UPLOADS_UNAVAILABLE;
	const them = failed === 1 ? 'it' : 'them';
	return canReopen ? `Add ${them} again.` : `Add ${them} again by editing the ${noun}.`;
}

export function stagedUploadMessage(
	noun: string,
	failure: StagedUploadFailure,
	canReopen = true
): string {
	return `The ${noun} was added, but ${missingPhotos(failure)}. ${nextStep(noun, failure, canReopen)}`;
}

// For a create that already reports another failure, so the photos follow on from it.
export function stagedUploadFollowUp(noun: string, failure: StagedUploadFailure): string {
	const missing = missingPhotos(failure);
	return `${missing.charAt(0).toUpperCase()}${missing.slice(1)} added either. ${nextStep(noun, failure, true)}`;
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
		message: stagedUploadMessage(noun, failure, canReopen)
	};
}

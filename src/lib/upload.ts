import type { ImageUploadRequest } from '@roguekeyboards/mykeebs-api-client';
import {
	ImageTooLargeError,
	MAX_IMAGE_BYTES,
	MAX_IMAGE_SIZE,
	UnsupportedImageError
} from './image-errors';
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
	if (image.size > MAX_IMAGE_BYTES) throw new ImageTooLargeError();
	const { uploadUrl } = await requestUpload({ contentType: image.type, sizeBytes: image.size });
	await uploadToSignedUrl(uploadUrl, image);
}

export type PhotoUploadFailure = {
	failed: number;
	tooLarge: number;
	unsupported: number;
	total: number;
	unavailable: boolean;
};

// Each photo is uploaded on its own, so one failure doesn't stop the rest.
// After a 429 every remaining upload would be refused too, so they aren't attempted.
export async function uploadEach(
	files: File[],
	upload: (file: File) => Promise<void>
): Promise<PhotoUploadFailure | null> {
	const failure = { failed: 0, tooLarge: 0, unsupported: 0, total: files.length };
	for (const [index, file] of files.entries()) {
		try {
			await upload(file);
		} catch (err) {
			if (isUploadsUnavailable(err)) {
				return { ...failure, failed: failure.failed + files.length - index, unavailable: true };
			}
			failure.failed++;
			if (err instanceof ImageTooLargeError) failure.tooLarge++;
			if (err instanceof UnsupportedImageError) failure.unsupported++;
		}
	}
	return failure.failed > 0 ? { ...failure, unavailable: false } : null;
}

function missingPhotos({ failed, total }: PhotoUploadFailure): string {
	if (failed < total)
		return `${failed} of its ${total} photos ${failed === 1 ? "wasn't" : "weren't"}`;
	return total === 1 ? "its photo wasn't" : "its photos weren't";
}

function nextStep(failure: PhotoUploadFailure, where = ''): string {
	const { failed, tooLarge, unsupported, unavailable } = failure;
	const subject = (count: number) => {
		if (count === failed) return failed === 1 ? "It's" : "They're";
		return count === 1 ? '1 was' : `${count} were`;
	};
	const reasons = [
		tooLarge > 0 && `${subject(tooLarge)} too detailed to fit under ${MAX_IMAGE_SIZE}.`,
		unsupported > 0 && `${subject(unsupported)} in a format this browser can't read.`
	].filter(Boolean);
	if (unavailable) return [...reasons, UPLOADS_UNAVAILABLE].join(' ');
	const unusable = tooLarge + unsupported;
	const them = failed === 1 ? 'it' : 'them';
	let action: string;
	if (unusable === 0) action = `Add ${them} again${where}.`;
	else if (unusable === failed)
		action = `Add ${failed === 1 ? 'a different one' : 'different ones'}${where}.`;
	else
		action = `Add ${them} again${where}, with a different photo for ${unusable === 1 ? 'that one' : 'those'}.`;
	return [...reasons, action].join(' ');
}

// For photos picked on an item being edited, which upload straight away.
export function pickedUploadMessage(failure: PhotoUploadFailure): string {
	const { failed, total } = failure;
	let missing: string;
	if (total === 1) missing = "That photo wasn't added.";
	else if (failed === total) missing = "Those photos weren't added.";
	else missing = `${failed} of ${total} photos ${failed === 1 ? "wasn't" : "weren't"} added.`;
	return `${missing} ${nextStep(failure)}`;
}

export function stagedUploadMessage(
	noun: string,
	failure: PhotoUploadFailure,
	canReopen = true
): string {
	const where = canReopen ? '' : ` by editing the ${noun}`;
	return `The ${noun} was added, but ${missingPhotos(failure)}. ${nextStep(failure, where)}`;
}

// For a create that already reports another failure, so the photos follow on from it.
export function stagedUploadFollowUp(failure: PhotoUploadFailure): string {
	const missing = missingPhotos(failure);
	return `${missing.charAt(0).toUpperCase()}${missing.slice(1)} added either. ${nextStep(failure)}`;
}

// After an ordinary failure the new item reopens for editing so the photos can
// be added again; after a 429 retrying won't help, so the page closes with a notice.
export function stagedUploadOutcome(
	noun: string,
	failure: PhotoUploadFailure | null,
	canReopen: boolean
): { reopen: boolean; message: string | null } {
	if (!failure) return { reopen: false, message: null };
	return {
		reopen: canReopen && !failure.unavailable,
		message: stagedUploadMessage(noun, failure, canReopen)
	};
}

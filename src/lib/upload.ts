import type { ImageUploadRequest } from '@rogueserenity/kbdb-api-client';
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

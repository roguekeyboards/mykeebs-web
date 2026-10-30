import { ImageStatus, ResponseError } from '@roguekeyboards/kbdb-api-client';
import { isProblemResponse } from '#lib/api/throttle.js';

export type ModeratedImage = { url?: string; status?: ImageStatus; rejectionReason?: string };

export function viewableImages<T extends ModeratedImage>(
	images: T[] | undefined
): (T & { url: string })[] {
	return (images ?? []).filter((image): image is T & { url: string } => image.url !== undefined);
}

export function primaryImageUrl(images: ModeratedImage[] | undefined): string | undefined {
	return images?.find((image) => image.url !== undefined)?.url;
}

export function isPending(image: ModeratedImage | undefined): boolean {
	return image?.status === ImageStatus.Pending;
}

export function anyPending(images: (ModeratedImage | undefined)[] | undefined): boolean {
	return images?.some(isPending) ?? false;
}

export function rejectionText(reason: string | undefined): string {
	if (reason === 'unprocessable') return "Couldn't be processed";
	return reason ? `Removed by moderation: ${reason}` : 'Removed by moderation';
}

export const UPLOADS_UNAVAILABLE = 'Uploads unavailable, try again later.';

export function isUploadsUnavailable(err: unknown): boolean {
	return (
		err instanceof ResponseError && err.response.status === 429 && isProblemResponse(err.response)
	);
}

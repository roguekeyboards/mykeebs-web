import type { KeycapSet } from '@roguekeyboards/mykeebs-api-client';
import type { ModeratedImage } from './image-moderation';

// Callers copy only image state from the refetch (withFreshImages and friends), so a
// late response can't undo an edit. cancel() drops a refetch still in flight, so it
// can't land on a photo uploaded since.
export function staleImageRefetcher<T>(
	fetchItem: (id: string) => Promise<T>,
	onFresh: (item: T, id: string) => void
) {
	let refetchedId: string | null = null;
	let generation = 0;

	return {
		reset() {
			refetchedId = null;
		},
		cancel() {
			refetchedId = null;
			generation++;
		},
		async refetch(id: string) {
			if (refetchedId === id) return;
			refetchedId = id;
			const started = generation;
			let item: T;
			try {
				item = await fetchItem(id);
			} catch {
				return;
			}
			if (started === generation) onFresh(item, id);
		}
	};
}

// A rejected image comes back without a url, so the moderation fields travel with it.
function withFresh<I extends ModeratedImage>(image: I, fresh: ModeratedImage): I {
	return { ...image, url: fresh.url, status: fresh.status, rejectionReason: fresh.rejectionReason };
}

type IdentifiedImage = { imageId: string } & ModeratedImage;

export function withFreshImages<T extends { images?: IdentifiedImage[] }>(
	current: T,
	fresh: { images?: IdentifiedImage[] }
): T {
	const images = new Map(fresh.images?.map((image) => [image.imageId, image]));
	return {
		...current,
		images: current.images?.map((image) => {
			const freshImage = images.get(image.imageId);
			return freshImage ? withFresh(image, freshImage) : image;
		})
	};
}

export function withFreshImage<T extends { image?: ModeratedImage }>(
	current: T,
	fresh: { image?: ModeratedImage }
): T {
	if (!current.image || !fresh.image) return current;
	return { ...current, image: withFresh(current.image, fresh.image) };
}

export function withFreshKitImages(current: KeycapSet, fresh: KeycapSet): KeycapSet {
	const kits = new Map(fresh.kits?.map((kit) => [kit.kitId, kit]));
	return {
		...current,
		kits: current.kits?.map((kit) => {
			const freshKit = kits.get(kit.kitId);
			return freshKit ? withFreshImage(kit, freshKit) : kit;
		})
	};
}

// Throttled per item so an image that's broken, not expired, can't refetch in a loop.
export function perItemImageRefetcher<T>(
	fetchItem: (id: string) => Promise<T>,
	onFresh: (item: T, id: string) => void,
	minIntervalMs = 60_000,
	now: () => number = Date.now
) {
	const lastFetched = new Map<string, number>();

	return async function refetch(id: string) {
		const last = lastFetched.get(id);
		if (last !== undefined && now() - last < minIntervalMs) return;
		lastFetched.set(id, now());
		let item: T;
		try {
			item = await fetchItem(id);
		} catch {
			return;
		}
		onFresh(item, id);
	};
}

export function updateWhere<T>(
	items: T[],
	matches: (item: T) => boolean,
	update: (item: T) => T
): T[] {
	return items.map((item) => (matches(item) ? update(item) : item));
}

export function anyImageFailed(
	urls: (string | undefined)[] | undefined,
	failedImages: ReadonlySet<string>
): boolean {
	return urls?.some((url) => url !== undefined && failedImages.has(url)) ?? false;
}

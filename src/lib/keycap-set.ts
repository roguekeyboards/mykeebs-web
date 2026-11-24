import type { KeycapKit, KeycapSet } from '@roguekeyboards/mykeebs-api-client';
import { earliestDate } from '#lib/purchases.js';

export function primaryKitImageUrl(set: KeycapSet): string | undefined {
	return set.kits?.find((kit) => kit.kitId === set.primaryKitId)?.image?.url;
}

export function kitsWithPhotos(set: KeycapSet): KeycapKit[] {
	return (set.kits ?? []).filter((kit) => kit.image?.url);
}

export function adjacentKitId(set: KeycapSet, kitId: string, delta: 1 | -1): string | null {
	const kits = set.kits ?? [];
	if (kits.length < 2) return null;
	const index = kits.findIndex((kit) => kit.kitId === kitId);
	if (index === -1) return null;
	return kits[(index + delta + kits.length) % kits.length].kitId;
}

export function earliestKitDate(
	set: KeycapSet,
	field: 'orderDate' | 'deliveryDate'
): number | undefined {
	return earliestDate({ purchases: (set.kits ?? []).map((kit) => kit.purchase ?? {}) }, field);
}

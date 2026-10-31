import type { KeycapKit, KeycapSet } from '@roguekeyboards/mykeebs-api-client';

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
	const kits = set.kits ?? [];
	const live = kits.filter((kit) => kit.purchase?.orderStatus?.toLowerCase() !== 'cancelled');
	const times = (live.length > 0 ? live : kits).flatMap((kit) => {
		const date = kit.purchase?.[field];
		return date ? [date.getTime()] : [];
	});
	return times.length > 0 ? Math.min(...times) : undefined;
}

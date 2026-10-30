import { describe, expect, it, vi } from 'vitest';
import {
	ImageStatus,
	type Build,
	type Keyboard,
	type KeycapSet,
	type Switch
} from '@roguekeyboards/kbdb-api-client';
import {
	anyImageFailed,
	perItemImageRefetcher,
	staleImageRefetcher,
	updateWhere,
	withFreshImage,
	withFreshImages,
	withFreshKitImages
} from './stale-images';

describe('staleImageRefetcher', () => {
	function deferredRefetcher() {
		let resolve: (item: { id: string }) => void = () => {};
		const onFresh = vi.fn();
		const refetcher = staleImageRefetcher(
			() => new Promise<{ id: string }>((r) => (resolve = r)),
			onFresh
		);
		return { refetcher, onFresh, resolve: (item: { id: string }) => resolve(item) };
	}

	it('drops a refetch still in flight when cancelled', async () => {
		const { refetcher, onFresh, resolve } = deferredRefetcher();

		const pending = refetcher.refetch('k1');
		refetcher.cancel();
		resolve({ id: 'k1' });
		await pending;

		expect(onFresh).not.toHaveBeenCalled();
	});

	it('still delivers a refetch in flight when reset for another item', async () => {
		const { refetcher, onFresh, resolve } = deferredRefetcher();

		const pending = refetcher.refetch('k1');
		refetcher.reset();
		resolve({ id: 'k1' });
		await pending;

		expect(onFresh).toHaveBeenCalledWith({ id: 'k1' }, 'k1');
	});

	it('hands the freshly fetched item to onFresh', async () => {
		const onFresh = vi.fn();
		const refetcher = staleImageRefetcher(async (id) => ({ id, url: 'fresh' }), onFresh);

		await refetcher.refetch('k1');

		expect(onFresh).toHaveBeenCalledWith({ id: 'k1', url: 'fresh' }, 'k1');
	});

	it('fetches an item only once, however many of its images fail', async () => {
		const fetchItem = vi.fn(async (id: string) => ({ id }));
		const refetcher = staleImageRefetcher(fetchItem, () => {});

		await Promise.all([refetcher.refetch('k1'), refetcher.refetch('k1')]);
		await refetcher.refetch('k1');

		expect(fetchItem).toHaveBeenCalledTimes(1);
	});

	it('fetches again for a different item', async () => {
		const fetchItem = vi.fn(async (id: string) => ({ id }));
		const refetcher = staleImageRefetcher(fetchItem, () => {});

		await refetcher.refetch('k1');
		await refetcher.refetch('k2');

		expect(fetchItem).toHaveBeenCalledTimes(2);
	});

	it('fetches the same item again after reset, i.e. when it is reopened', async () => {
		const fetchItem = vi.fn(async (id: string) => ({ id }));
		const refetcher = staleImageRefetcher(fetchItem, () => {});

		await refetcher.refetch('k1');
		refetcher.reset();
		await refetcher.refetch('k1');

		expect(fetchItem).toHaveBeenCalledTimes(2);
	});

	it('swallows a failed fetch without calling onFresh or retrying', async () => {
		const fetchItem = vi.fn(async () => {
			throw new Error('network');
		});
		const onFresh = vi.fn();
		const refetcher = staleImageRefetcher(fetchItem, onFresh);

		await expect(refetcher.refetch('k1')).resolves.toBeUndefined();
		await refetcher.refetch('k1');

		expect(onFresh).not.toHaveBeenCalled();
		expect(fetchItem).toHaveBeenCalledTimes(1);
	});
});

describe('updateWhere', () => {
	const rows = [
		{ id: 'a', url: 'a-old' },
		{ id: 'b', url: 'b-old' }
	];

	it('updates only the matching row, in place in the order', () => {
		expect(
			updateWhere(
				rows,
				(row) => row.id === 'b',
				(row) => ({ ...row, url: 'b-new' })
			)
		).toEqual([
			{ id: 'a', url: 'a-old' },
			{ id: 'b', url: 'b-new' }
		]);
	});

	it('leaves the rows untouched when nothing matches', () => {
		expect(
			updateWhere(
				rows,
				(row) => row.id === 'z',
				(row) => ({ ...row, url: 'new' })
			)
		).toEqual(rows);
	});
});

describe('anyImageFailed', () => {
	const failed = new Set(['dead.png']);

	it('is true when any of the URLs already failed to load', () => {
		expect(anyImageFailed(['ok.png', 'dead.png'], failed)).toBe(true);
	});

	it('is false when none did, skipping missing images', () => {
		expect(anyImageFailed(['ok.png', undefined], failed)).toBe(false);
	});

	it('is false for an item with no images', () => {
		expect(anyImageFailed([], failed)).toBe(false);
		expect(anyImageFailed(undefined, failed)).toBe(false);
	});
});

describe('perItemImageRefetcher', () => {
	function setup(minIntervalMs = 60_000) {
		let clock = 0;
		const fetchItem = vi.fn(async (id: string) => ({ id }));
		const onFresh = vi.fn();
		const refetch = perItemImageRefetcher(fetchItem, onFresh, minIntervalMs, () => clock);
		return { refetch, fetchItem, onFresh, advance: (ms: number) => (clock += ms) };
	}

	it('hands each freshly fetched item to onFresh', async () => {
		const { refetch, onFresh } = setup();

		await refetch('b1');

		expect(onFresh).toHaveBeenCalledWith({ id: 'b1' }, 'b1');
	});

	it('fetches an item once, however many of its images fail at once', async () => {
		const { refetch, fetchItem } = setup();

		await Promise.all([refetch('b1'), refetch('b1'), refetch('b1')]);

		expect(fetchItem).toHaveBeenCalledTimes(1);
	});

	it('fetches different items independently', async () => {
		const { refetch, fetchItem } = setup();

		await Promise.all([refetch('b1'), refetch('b2')]);

		expect(fetchItem).toHaveBeenCalledTimes(2);
	});

	it("won't fetch the same item again within the interval, so a broken image can't loop", async () => {
		const { refetch, fetchItem, advance } = setup(60_000);

		await refetch('b1');
		advance(59_999);
		await refetch('b1');

		expect(fetchItem).toHaveBeenCalledTimes(1);
	});

	it('fetches the same item again once the interval has passed', async () => {
		const { refetch, fetchItem, advance } = setup(60_000);

		await refetch('b1');
		advance(60_000);
		await refetch('b1');

		expect(fetchItem).toHaveBeenCalledTimes(2);
	});

	it('swallows a failed fetch without calling onFresh', async () => {
		const onFresh = vi.fn();
		const refetch = perItemImageRefetcher(async () => {
			throw new Error('network');
		}, onFresh);

		await expect(refetch('b1')).resolves.toBeUndefined();
		expect(onFresh).not.toHaveBeenCalled();
	});
});

describe('withFreshImages', () => {
	const keyboard = (name: string, images: [string, string][]): Keyboard => ({
		id: 'k',
		brand: 'KBDFans',
		name,
		images: images.map(([imageId, url]) => ({ imageId, url }))
	});

	it('takes fresh URLs by image id and keeps everything else as shown', () => {
		const shown = keyboard('Agar (edited)', [
			['a', 'a-old'],
			['b', 'b-old']
		]);
		const fresh = keyboard('Agar', [
			['b', 'b-new'],
			['a', 'a-new']
		]);

		expect(withFreshImages(shown, fresh)).toEqual(
			keyboard('Agar (edited)', [
				['a', 'a-new'],
				['b', 'b-new']
			])
		);
	});

	it('keeps an image the refetch no longer has, and ignores one it newly has', () => {
		const shown = keyboard('Agar', [['a', 'a-old']]);
		const fresh = keyboard('Agar', [['c', 'c-new']]);

		expect(withFreshImages(shown, fresh).images).toEqual([{ imageId: 'a', url: 'a-old' }]);
	});
});

describe('stale-url refresh with moderation state', () => {
	const pending = { imageId: 'i1', url: 'old', status: ImageStatus.Pending };
	const rejected = { imageId: 'i1', status: ImageStatus.Rejected, rejectionReason: 'Explicit' };

	it('takes a rejection, dropping the url the image no longer has', () => {
		const shown: Keyboard = { id: 'k', brand: 'KBDFans', name: 'Agar', images: [pending] };
		const fresh: Keyboard = { ...shown, images: [rejected] };

		expect(withFreshImages(shown, fresh).images).toEqual([rejected]);
	});

	it('takes an approval along with the new url', () => {
		const shown: Keyboard = { id: 'k', brand: 'KBDFans', name: 'Agar', images: [pending] };
		const approved = { imageId: 'i1', url: 'new', status: ImageStatus.Approved };

		expect(withFreshImages(shown, { ...shown, images: [approved] }).images).toEqual([approved]);
	});

	it('takes a rejection for a switch image', () => {
		const shown: Switch = {
			id: 'sw',
			brand: 'HMX',
			name: 'Aperol',
			type: 'Linear',
			image: pending
		};
		const fresh: Switch = { ...shown, image: rejected };

		expect(withFreshImage(shown, fresh).image).toEqual(rejected);
	});

	it('takes a rejection for a kit image', () => {
		const shown: KeycapSet = {
			id: 's',
			brand: 'GMK',
			name: 'Olivia',
			kits: [{ kitId: 'base', name: 'Base', image: pending }]
		};
		const fresh: KeycapSet = { ...shown, kits: [{ kitId: 'base', name: 'Base', image: rejected }] };

		expect(withFreshKitImages(shown, fresh).kits?.[0].image).toEqual(rejected);
	});
});

describe('withFreshImage', () => {
	const sw = (name: string, url?: string): Switch => ({
		id: 'sw',
		brand: 'HMX',
		name,
		type: 'Linear',
		image: url ? { url } : undefined
	});

	it('takes the fresh URL and keeps everything else as shown', () => {
		expect(withFreshImage(sw('Aperol (edited)', 'old'), sw('Aperol', 'new'))).toEqual(
			sw('Aperol (edited)', 'new')
		);
	});

	it('leaves the switch alone when either side has no image', () => {
		const noImage = sw('Aperol');
		expect(withFreshImage(noImage, sw('Aperol', 'new'))).toBe(noImage);

		const shown = sw('Aperol', 'old');
		expect(withFreshImage(shown, sw('Aperol'))).toBe(shown);
	});
});

describe('withFreshKitImages', () => {
	const set = (name: string, kits: [string, string?][]): KeycapSet => ({
		id: 's',
		brand: 'GMK',
		name,
		kits: kits.map(([kitId, url]) => ({ kitId, name: kitId, image: url ? { url } : undefined }))
	});

	it('takes fresh URLs by kit id and keeps everything else as shown', () => {
		const shown = set('Olivia (edited)', [
			['base', 'base-old'],
			['novelties', 'nov-old']
		]);
		const fresh = set('Olivia', [
			['novelties', 'nov-new'],
			['base', 'base-new']
		]);

		expect(withFreshKitImages(shown, fresh)).toEqual(
			set('Olivia (edited)', [
				['base', 'base-new'],
				['novelties', 'nov-new']
			])
		);
	});

	it('keeps a kit the refetch no longer has, and ignores one it newly has', () => {
		const shown = set('Olivia', [['base', 'base-old']]);
		const fresh = set('Olivia', [['extras', 'extras-new']]);

		expect(withFreshKitImages(shown, fresh).kits).toEqual(shown.kits);
	});

	it("doesn't give a kit an image it doesn't show, or drop one it does", () => {
		const shown = set('Olivia', [['base'], ['novelties', 'nov-old']]);
		const fresh = set('Olivia', [['base', 'base-new'], ['novelties']]);

		expect(withFreshKitImages(shown, fresh).kits).toEqual(shown.kits);
	});
});

describe('withFreshImages on a build', () => {
	it('takes fresh URLs by image id and leaves everything else as shown', () => {
		const shown: Build = {
			id: 'b',
			keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
			notes: 'edited',
			images: [{ imageId: 'i1', url: 'old' }]
		};
		const fresh: Build = {
			id: 'b',
			keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
			notes: 'stale',
			images: [{ imageId: 'i1', url: 'new' }]
		};

		expect(withFreshImages(shown, fresh)).toEqual({
			...shown,
			images: [{ imageId: 'i1', url: 'new' }]
		});
	});
});

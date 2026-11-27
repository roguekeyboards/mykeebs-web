import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemLink, shareLink } from './share';

afterEach(() => {
	vi.unstubAllGlobals();
});

function device({ touch, share }: { touch: boolean; share?: () => Promise<void> }) {
	const writeText = vi.fn(async () => {});
	vi.stubGlobal('matchMedia', () => ({ matches: touch }));
	vi.stubGlobal('navigator', { share, clipboard: { writeText } });
	return writeText;
}

describe('itemLink', () => {
	it('adds the item to the current address, keeping its filters', () => {
		const url = new URL('http://localhost/u/me/switches?status=delivered&open=old');

		expect(itemLink(url, 'sw 1')).toBe('http://localhost/u/me/switches?status=delivered&open=sw+1');
	});
});

describe('shareLink', () => {
	const link = 'http://localhost/u/me/switches?open=sw-1';

	it('opens the share sheet on a touch device that has one', async () => {
		const share = vi.fn(async () => {});
		const writeText = device({ touch: true, share });

		expect(await shareLink(link, 'Aperol')).toBe('shared');
		expect(share).toHaveBeenCalledWith({ title: 'Aperol', url: link });
		expect(writeText).not.toHaveBeenCalled();
	});

	it('does nothing more when the share sheet is dismissed', async () => {
		const writeText = device({
			touch: true,
			share: async () => {
				throw new DOMException('dismissed', 'AbortError');
			}
		});

		expect(await shareLink(link, 'Aperol')).toBe('cancelled');
		expect(writeText).not.toHaveBeenCalled();
	});

	it('does nothing more on a second tap while the share sheet is open', async () => {
		const writeText = device({
			touch: true,
			share: async () => {
				throw new DOMException('already open', 'InvalidStateError');
			}
		});

		expect(await shareLink(link, 'Aperol')).toBe('cancelled');
		expect(writeText).not.toHaveBeenCalled();
	});

	it('copies the link when the share sheet fails', async () => {
		const writeText = device({
			touch: true,
			share: async () => {
				throw new DOMException('denied', 'NotAllowedError');
			}
		});

		expect(await shareLink(link, 'Aperol')).toBe('copied');
		expect(writeText).toHaveBeenCalledWith(link);
	});

	it('copies the link without a touch screen, even where a share sheet exists', async () => {
		const share = vi.fn(async () => {});
		const writeText = device({ touch: false, share });

		expect(await shareLink(link, 'Aperol')).toBe('copied');
		expect(writeText).toHaveBeenCalledWith(link);
		expect(share).not.toHaveBeenCalled();
	});

	it('says so when the link cannot be copied', async () => {
		device({ touch: false }).mockRejectedValue(new Error('denied'));

		expect(await shareLink(link, 'Aperol')).toBe('failed');
	});
});

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export function itemLink(url: { href: string }, id: string): string {
	const link = new URL(url.href);
	link.searchParams.set('open', id);
	return link.href;
}

// Phones get the system share sheet; elsewhere the link is copied, which is what a desktop
// browser's own share sheet would mostly be used for anyway.
export async function shareLink(link: string, title: string): Promise<ShareOutcome> {
	const touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
	if (touch && typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, url: link });
			return 'shared';
		} catch (error) {
			// Dismissed, or a second tap while the sheet is still open.
			if (
				error instanceof DOMException &&
				(error.name === 'AbortError' || error.name === 'InvalidStateError')
			) {
				return 'cancelled';
			}
		}
	}
	try {
		await navigator.clipboard.writeText(link);
		return 'copied';
	} catch {
		return 'failed';
	}
}

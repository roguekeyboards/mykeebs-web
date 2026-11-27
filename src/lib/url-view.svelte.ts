import { untrack } from 'svelte';
import { page } from '$app/state';
import { replaceState } from '$app/navigation';
import {
	readView,
	urlWithView,
	viewParams,
	type View,
	type ViewOptions
} from '#lib/view-params.js';

export const URL_WRITE_DELAY_MS = 300;

// Keeps a page's view in its address: a navigation that changes the address (a link, Back)
// resets the view to match, and a change to the view replaces the address after a short pause,
// since browsers throttle replaceState calls made on every keystroke.
export function syncViewWithUrl(
	options: () => ViewOptions,
	get: () => View,
	set: (view: View) => void
): View {
	const key = (view: View) => viewParams(view).toString();
	const initial = readView(page.url.searchParams, options());
	let written = key(initial);
	let pathname = page.url.pathname;
	let ownHref: string | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const url = page.url;
		const fromUrl = readView(url.searchParams, options());
		if (url.href === ownHref) return;
		const moved = url.pathname !== pathname;
		pathname = url.pathname;
		if (!moved && key(fromUrl) === written) return;
		// A navigation: a change still waiting to be written belonged to the page left behind.
		clearTimeout(timer);
		written = key(fromUrl);
		if (key(untrack(get)) !== written) set(fromUrl);
	});

	$effect(() => {
		const view = get();
		const wanted = key(view);
		if (wanted === written) return;
		timer = setTimeout(() => {
			written = wanted;
			const next = urlWithView(page.url, view);
			ownHref = next.href;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, query only
			replaceState(next, page.state);
		}, URL_WRITE_DELAY_MS);
		return () => clearTimeout(timer);
	});

	return initial;
}

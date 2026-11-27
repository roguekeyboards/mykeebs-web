import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Visibility } from '@roguekeyboards/mykeebs-api-client';
import { page as fakePage } from './test-support/fake-page.svelte.js';
import ShareButton from './ShareButton.svelte';

vi.mock('$app/state', () => import('./test-support/fake-page.svelte.js'));

afterEach(() => {
	vi.restoreAllMocks();
});

const button = () => page.getByRole('button', { name: 'Share link to Aperol' });

describe('ShareButton.svelte', () => {
	it('copies a link that opens the item, and says so', async () => {
		fakePage.url = new URL('http://localhost/u/me/switches?q=ape');
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		await render(ShareButton, { id: 'sw-1', title: 'Aperol', visibility: Visibility.Public });

		await button().click();

		expect(writeText).toHaveBeenCalledWith('http://localhost/u/me/switches?q=ape&open=sw-1');
		await expect.element(page.getByRole('status')).toHaveTextContent('Link copied');
		await expect.element(button()).toHaveAttribute('title', 'Link copied');
	});

	it('says so when the link cannot be copied', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		await render(ShareButton, { id: 'sw-1', title: 'Aperol' });

		await button().click();

		await expect.element(page.getByRole('status')).toHaveTextContent("Couldn't copy the link");
	});

	it('is not offered for a private item, which nobody else could open', async () => {
		await render(ShareButton, { id: 'sw-1', title: 'Aperol', visibility: Visibility.Private });

		await expect.element(button()).not.toBeInTheDocument();
	});
});

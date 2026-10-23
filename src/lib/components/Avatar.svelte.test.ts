import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Avatar from './Avatar.svelte';

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

describe('Avatar.svelte', () => {
	it('is decorative by default, since the name is shown beside it', async () => {
		await render(Avatar, { name: 'rogue.serenity', imageUrl: PIXEL });

		expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
		await expect.element(page.getByRole('img')).not.toBeInTheDocument();
	});

	it('hides its initials from screen readers when there is no photo', async () => {
		await render(Avatar, { name: 'rogue.serenity' });

		await expect.element(page.getByText('RO')).toHaveAttribute('aria-hidden', 'true');
		await expect.element(page.getByRole('img')).not.toBeInTheDocument();
	});

	it('is named by its label when it is the subject, with or without a photo', async () => {
		const { rerender } = await render(Avatar, {
			name: 'rogue.serenity',
			imageUrl: PIXEL,
			label: 'Your profile photo'
		});
		await expect.element(page.getByRole('img', { name: 'Your profile photo' })).toBeInTheDocument();

		await rerender({ name: 'rogue.serenity', imageUrl: undefined, label: 'Your profile photo' });

		await expect.element(page.getByRole('img', { name: 'Your profile photo' })).toBeInTheDocument();
	});
});

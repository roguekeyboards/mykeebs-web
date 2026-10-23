import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DeleteBlocked from './DeleteBlocked.svelte';

describe('DeleteBlocked.svelte', () => {
	it('names the builds that block the delete', async () => {
		await render(DeleteBlocked, { builds: ['Manta', 'Owlab Spring'], onCancel: vi.fn() });

		await expect
			.element(
				page
					.getByRole('alert')
					.filter({ hasText: 'Used in: Manta, Owlab Spring. Remove it from those builds first.' })
			)
			.toBeInTheDocument();
	});

	it('offers only Cancel, never a way to delete anyway', async () => {
		const onCancel = vi.fn();
		await render(DeleteBlocked, { builds: ['Manta'], onCancel });

		await expect.element(page.getByRole('button')).toMatchTextContent('Cancel');
		await page.getByRole('button').click();

		expect(onCancel).toHaveBeenCalled();
	});
});

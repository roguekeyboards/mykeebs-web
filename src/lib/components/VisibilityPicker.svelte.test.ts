import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Visibility } from '@roguekeyboards/kbdb-api-client';
import VisibilityPicker from './VisibilityPicker.svelte';

describe('VisibilityPicker.svelte', () => {
	it('marks the current value as the checked radio', async () => {
		await render(VisibilityPicker, { value: Visibility.Private });

		await expect
			.element(page.getByRole('radio', { name: 'Private' }))
			.toHaveAttribute('aria-checked', 'true');
		await expect
			.element(page.getByRole('radio', { name: 'Public' }))
			.toHaveAttribute('aria-checked', 'false');
	});

	it('exposes all three tiers at once', async () => {
		await render(VisibilityPicker, { value: Visibility.Private });

		await expect.element(page.getByRole('radio', { name: 'Private' })).toBeInTheDocument();
		await expect.element(page.getByRole('radio', { name: 'Signed in' })).toBeInTheDocument();
		await expect.element(page.getByRole('radio', { name: 'Public' })).toBeInTheDocument();
	});

	it('selects a tier on click', async () => {
		await render(VisibilityPicker, { value: Visibility.Private });

		await userEvent.click(page.getByRole('radio', { name: 'Public' }));

		await expect
			.element(page.getByRole('radio', { name: 'Public' }))
			.toHaveAttribute('aria-checked', 'true');
	});

	it('moves selection with the arrow keys and wraps', async () => {
		await render(VisibilityPicker, { value: Visibility.Private });

		await userEvent.click(page.getByRole('radio', { name: 'Private' }));
		await userEvent.keyboard('{ArrowRight}');
		await expect
			.element(page.getByRole('radio', { name: 'Signed in' }))
			.toHaveAttribute('aria-checked', 'true');

		// Private is first, so stepping back from it wraps to Public.
		await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
		await expect
			.element(page.getByRole('radio', { name: 'Public' }))
			.toHaveAttribute('aria-checked', 'true');
	});

	it('keeps only the selected tier in the tab order', async () => {
		await render(VisibilityPicker, { value: Visibility.Authenticated });

		await expect
			.element(page.getByRole('radio', { name: 'Signed in' }))
			.toHaveAttribute('tabindex', '0');
		await expect
			.element(page.getByRole('radio', { name: 'Private' }))
			.toHaveAttribute('tabindex', '-1');
	});
});

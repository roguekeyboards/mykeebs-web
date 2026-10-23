import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import KeycapSetForm from './KeycapSetForm.svelte';

describe('KeycapSetForm.svelte', () => {
	it('does not submit the form when Enter is pressed in a text field', async () => {
		const onSubmit = vi.fn();
		await render(KeycapSetForm, { saving: false, error: null, onSubmit, onCancel: () => {} });

		const brand = page.getByLabelText('Brand');
		await brand.fill('Drop');
		await brand.click();
		await userEvent.keyboard('{Enter}');

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('marks brand and name required, and flags the empty ones after a failed save', async () => {
		await render(KeycapSetForm, {
			saving: false,
			error: null,
			onSubmit: vi.fn(),
			onCancel: () => {}
		});
		const brand = page.getByLabelText('Brand');
		const name = page.getByLabelText('Name');
		await expect.element(brand).toBeRequired();
		await expect.element(name).toBeRequired();
		await expect.element(brand).not.toBeInvalid();

		await brand.fill('GMK');
		await page.getByRole('button', { name: 'Add keycap set' }).click();

		await expect.element(name).toBeInvalid();
		await expect.element(name).toHaveAccessibleDescription('Brand and name are required.');
		await expect.element(brand).not.toBeInvalid();
	});
});

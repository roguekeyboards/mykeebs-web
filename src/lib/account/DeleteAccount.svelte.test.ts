import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DeleteAccount from './DeleteAccount.svelte';

const dialog = () => page.getByRole('dialog', { name: 'Delete your account?' });
const confirmButton = () => dialog().getByRole('button', { name: 'Delete my account' });
const usernameField = () =>
	dialog().getByRole('textbox', { name: 'Type rogue.serenity to confirm' });

async function renderAndOpen(onDelete: () => Promise<void> = vi.fn(async () => {})) {
	await render(DeleteAccount, { username: 'rogue.serenity', onDelete });
	await page.getByRole('button', { name: 'Delete account' }).click();
	return onDelete;
}

describe('DeleteAccount.svelte', () => {
	it('says what is lost before anything is deleted', async () => {
		const onDelete = await renderAndOpen();

		await expect
			.element(dialog())
			.toMatchTextContent(/profile and avatar, every keyboard, switch, keycap set and build/);
		await expect.element(dialog()).toMatchTextContent("It can't be undone.");
		expect(onDelete).not.toHaveBeenCalled();
	});

	it('only enables the delete once the exact username is typed', async () => {
		await renderAndOpen();

		await expect.element(confirmButton()).toBeDisabled();
		await usernameField().fill('rogue.serenit');
		await expect.element(confirmButton()).toBeDisabled();
		await usernameField().fill('Rogue.Serenity');
		await expect.element(confirmButton()).toBeDisabled();
		await usernameField().fill('rogue.serenity');
		await expect.element(confirmButton()).toBeEnabled();
	});

	it('deletes once and shows progress while it runs', async () => {
		let finish!: () => void;
		const onDelete = await renderAndOpen(
			vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
		);

		await usernameField().fill('rogue.serenity');
		await confirmButton().click();
		await expect.element(dialog().getByRole('button', { name: 'Deleting…' })).toBeDisabled();
		await userEvent.keyboard('{Enter}');

		expect(onDelete).toHaveBeenCalledOnce();
		finish();
	});

	it('says so when the delete fails and lets you try again', async () => {
		const onDelete = await renderAndOpen(
			vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('network')).mockResolvedValue()
		);

		await usernameField().fill('rogue.serenity');
		await confirmButton().click();
		await expect
			.element(dialog().getByRole('alert'))
			.toHaveTextContent('Your account could not be deleted. Please try again.');

		await confirmButton().click();
		expect(onDelete).toHaveBeenCalledTimes(2);
	});

	it('closes without deleting when cancelled, and starts empty next time', async () => {
		const onDelete = await renderAndOpen();

		await usernameField().fill('rogue.serenity');
		await dialog().getByRole('button', { name: 'Cancel' }).click();
		await expect.element(dialog()).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete account' }).click();
		await expect.element(usernameField()).toHaveValue('');
		expect(onDelete).not.toHaveBeenCalled();
	});
});

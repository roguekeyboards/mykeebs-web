import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { signOut } from '#lib/auth/auth.svelte.js';
import ProfileMenu from './ProfileMenu.svelte';

vi.mock('#lib/auth/auth.svelte.js', () => ({
	auth: { status: 'signed-in', user: { id: 'user-1', email: 'jay@example.com' } },
	signOut: vi.fn()
}));
vi.mock('#lib/profile/profile.svelte.js', () => ({
	profile: {
		status: 'ready',
		data: { userId: 'user-1', username: 'rogue.serenity', discoverable: true }
	}
}));

const trigger = () => page.getByRole('button', { name: /rogue\.serenity/ });

describe('ProfileMenu.svelte', () => {
	it('is a disclosure: the button reports and controls its panel, with no menu roles', async () => {
		render(ProfileMenu);
		await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false');

		await trigger().click();

		await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true');
		const panelId = trigger().element().getAttribute('aria-controls');
		expect(document.getElementById(panelId!)).toContainElement(
			page.getByRole('link', { name: 'Edit profile' }).element() as HTMLElement
		);
		expect(document.querySelector('[role="menu"], [role="menuitem"]')).toBeNull();
		expect(trigger().element().hasAttribute('aria-haspopup')).toBe(false);
	});

	it('closes on Escape and returns focus to the button', async () => {
		render(ProfileMenu);
		await trigger().click();
		await page.getByRole('link', { name: 'Edit profile' }).element().focus();

		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument();
		await expect.element(trigger()).toHaveFocus();
	});

	it('signs out from the panel', async () => {
		render(ProfileMenu);
		await trigger().click();

		await page.getByRole('button', { name: 'Sign out' }).click();

		expect(signOut).toHaveBeenCalledOnce();
	});
});

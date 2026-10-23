import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { signOut } from '#lib/auth/auth.svelte.js';
import ProfileMenu from './ProfileMenu.svelte';

const profileState = vi.hoisted(() => ({
	status: 'ready',
	data: { userId: 'user-1', username: 'rogue.serenity', discoverable: true } as unknown
}));

vi.mock('#lib/auth/auth.svelte.js', () => ({ signOut: vi.fn() }));
vi.mock('#lib/profile/profile.svelte.js', () => ({ profile: profileState }));

beforeEach(() => {
	profileState.status = 'ready';
	profileState.data = { userId: 'user-1', username: 'rogue.serenity', discoverable: true };
});

const trigger = () => page.getByRole('button', { name: /rogue\.serenity/ });

describe('ProfileMenu.svelte', () => {
	it('is a disclosure: the button reports and controls its panel, with no menu roles', async () => {
		await render(ProfileMenu);
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
		await render(ProfileMenu);
		await trigger().click();
		await page.getByRole('link', { name: 'Edit profile' }).element().focus();

		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument();
		await expect.element(trigger()).toHaveFocus();
	});

	it('signs out from the panel', async () => {
		await render(ProfileMenu);
		await trigger().click();

		await page.getByRole('button', { name: 'Sign out' }).click();

		expect(signOut).toHaveBeenCalledOnce();
	});

	it('calls you "you" until you have a profile', async () => {
		profileState.status = 'none';
		profileState.data = undefined;
		await render(ProfileMenu);

		await expect.element(page.getByRole('button', { name: 'you' })).toBeInTheDocument();
	});
});

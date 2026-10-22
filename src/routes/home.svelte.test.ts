import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import { signIn } from '#lib/auth/auth.svelte.js';
import HomePage from './+page.svelte';

const state = vi.hoisted(() => ({
	auth: { status: 'signed-out' as string },
	profile: { status: 'idle' as string, data: null as { username: string } | null }
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('#lib/auth/auth.svelte.js', () => ({ auth: state.auth, signIn: vi.fn() }));
vi.mock('#lib/profile/profile.svelte.js', () => ({ profile: state.profile }));

beforeEach(() => {
	vi.clearAllMocks();
	state.auth.status = 'signed-out';
	state.profile.status = 'idle';
	state.profile.data = null;
});

describe('home page', () => {
	describe('signed out', () => {
		it('introduces the site instead of redirecting', async () => {
			render(HomePage);

			await expect
				.element(
					page.getByRole('heading', {
						level: 1,
						name: 'Your keyboard collection, all in one place.'
					})
				)
				.toBeInTheDocument();
			expect(goto).not.toHaveBeenCalled();
		});

		it('signs in, or creates an account, from one button', async () => {
			render(HomePage);

			await page.getByRole('button', { name: 'Sign in or create an account' }).click();

			expect(signIn).toHaveBeenCalledOnce();
		});

		it('links to Discover', async () => {
			render(HomePage);

			await expect
				.element(page.getByRole('link', { name: /Discover builders/ }))
				.toHaveAttribute('href', '/discover');
		});
	});

	describe('signed in', () => {
		beforeEach(() => {
			state.auth.status = 'signed-in';
		});

		it('goes to the collection once the profile is ready', async () => {
			state.profile.status = 'ready';
			state.profile.data = { username: 'rogue.serenity' };

			render(HomePage);

			await vi.waitFor(() =>
				expect(goto).toHaveBeenCalledWith('/u/rogue.serenity/keyboards', { replaceState: true })
			);
		});

		it('goes to profile setup when there is no profile yet', async () => {
			state.profile.status = 'none';

			render(HomePage);

			await vi.waitFor(() =>
				expect(goto).toHaveBeenCalledWith('/profile/edit', { replaceState: true })
			);
		});

		it('waits, showing nothing, while the profile loads', async () => {
			state.profile.status = 'loading';

			render(HomePage);

			await expect
				.element(page.getByRole('button', { name: 'Sign in or create an account' }))
				.not.toBeInTheDocument();
			expect(goto).not.toHaveBeenCalled();
		});
	});

	it('shows nothing while sign-in state is still loading', async () => {
		state.auth.status = 'loading';

		render(HomePage);

		await expect.element(page.getByRole('heading')).not.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});

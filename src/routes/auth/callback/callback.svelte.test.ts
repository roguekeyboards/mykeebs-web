import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import { consumeStateMatches, exchangeCodeForToken } from '#lib/auth/auth.svelte.js';
import CallbackPage from './+page.svelte';

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/auth/callback') }));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('#lib/auth/auth.svelte.js', () => ({
	consumeStateMatches: vi.fn(),
	exchangeCodeForToken: vi.fn()
}));

const consume = vi.mocked(consumeStateMatches);
const exchange = vi.mocked(exchangeCodeForToken);
const navigate = vi.mocked(goto);

function arriveWith(params: Record<string, string>) {
	pageState.url = new URL(`http://localhost/auth/callback?${new URLSearchParams(params)}`);
}

describe('Auth callback page', () => {
	beforeEach(() => {
		consume.mockReset();
		exchange.mockReset();
		navigate.mockReset();
	});

	it('exchanges a verified code and replaces the callback URL with home', async () => {
		arriveWith({ code: 'code-1', state: 'state-1' });
		consume.mockReturnValue(true);
		exchange.mockResolvedValue();

		render(CallbackPage);

		await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replaceState: true }));
		expect(consume).toHaveBeenCalledWith('state-1');
		expect(exchange).toHaveBeenCalledWith('code-1');
	});

	it('shows progress while the exchange is pending', async () => {
		arriveWith({ code: 'code-1', state: 'state-1' });
		consume.mockReturnValue(true);
		exchange.mockReturnValue(new Promise(() => {}));

		render(CallbackPage);

		await expect.element(page.getByText('Signing you in…')).toBeInTheDocument();
	});

	it('refuses a code whose state does not verify', async () => {
		arriveWith({ code: 'attacker-code', state: 'attacker-state' });
		consume.mockReturnValue(false);

		render(CallbackPage);

		await expect.element(page.getByText(/Sign-in could not be verified/)).toBeInTheDocument();
		expect(consume).toHaveBeenCalledWith('attacker-state');
		expect(exchange).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('refuses a code that arrives with no state at all', async () => {
		arriveWith({ code: 'code-1' });
		consume.mockReturnValue(false);

		render(CallbackPage);

		await expect.element(page.getByText(/Sign-in could not be verified/)).toBeInTheDocument();
		expect(consume).toHaveBeenCalledWith(null);
		expect(exchange).not.toHaveBeenCalled();
	});

	// A rejected redirect must not leave the stored state behind for a replay.
	it('still consumes the state when the code is missing', async () => {
		arriveWith({ state: 'state-1' });
		consume.mockReturnValue(true);

		render(CallbackPage);

		await expect
			.element(page.getByText('No authorization code in the redirect URL.'))
			.toBeInTheDocument();
		expect(consume).toHaveBeenCalledWith('state-1');
		expect(exchange).not.toHaveBeenCalled();
	});

	it('reports a failed exchange and stays put', async () => {
		arriveWith({ code: 'code-1', state: 'state-1' });
		consume.mockReturnValue(true);
		exchange.mockRejectedValue(new Error('Token exchange failed: 400'));

		render(CallbackPage);

		await expect.element(page.getByText('Sign-in failed. Please try again.')).toBeInTheDocument();
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe('Auth callback page title', () => {
	it('titles the tab', async () => {
		arriveWith({ code: 'code-1', state: 'state-1' });
		consume.mockReturnValue(true);
		exchange.mockReturnValue(new Promise(() => {}));

		render(CallbackPage);

		await vi.waitFor(() => expect(document.title).toBe('Signing in · mykeebs'));
	});
});

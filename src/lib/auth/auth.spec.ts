import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_STYTCH_CLIENT_ID } from '$app/env/public';
import { generateCodeChallenge } from './pkce';

const ORIGIN = 'http://localhost:5173';
const AUTHORIZE_ENDPOINT = 'https://idp.test/authorize';
const TOKEN_ENDPOINT = 'https://issuer.test/token';
const END_SESSION_ENDPOINT = 'https://idp.test/end-session';

const oidcEndpoints = vi.hoisted(() => vi.fn());
vi.mock('./oidc', () => ({ oidcEndpoints }));

const VERIFIER_KEY = 'stytch_pkce_code_verifier';
const STATE_KEY = 'stytch_oauth_state';
const ACCESS_KEY = 'stytch_access_token';
const REFRESH_KEY = 'stytch_refresh_token';
const ID_TOKEN_KEY = 'stytch_id_token';

type AuthModule = typeof import('./auth.svelte');
let authModule: AuthModule;
let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

function jwt(payload: Record<string, unknown>): string {
	const encode = (value: unknown) =>
		btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `${encode({ alg: 'none' })}.${encode(payload)}.sig`;
}

function tokenExpiringIn(seconds: number, sub = 'user-1'): string {
	return jwt({ sub, exp: Math.floor(Date.now() / 1000) + seconds });
}

function tokenResponse(body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), { status: 200 });
}

function sentForm(call = 0): URLSearchParams {
	return new URLSearchParams(String(fetchMock.mock.calls[call][1].body));
}

beforeEach(async () => {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	});
	assign = vi.fn();
	vi.stubGlobal('window', { location: { origin: ORIGIN, assign } });
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	oidcEndpoints.mockReset().mockResolvedValue({
		authorization: AUTHORIZE_ENDPOINT,
		token: TOKEN_ENDPOINT,
		endSession: END_SESSION_ENDPOINT
	});

	vi.resetModules();
	authModule = await import('./auth.svelte');
});

describe('consumeStateMatches', () => {
	it('accepts the state it stored', () => {
		localStorage.setItem(STATE_KEY, 'abc123');
		expect(authModule.consumeStateMatches('abc123')).toBe(true);
	});

	it('rejects a state the attacker picked', () => {
		localStorage.setItem(STATE_KEY, 'abc123');
		expect(authModule.consumeStateMatches('attacker')).toBe(false);
	});

	// The bare-callback case: no flow was ever started in this browser.
	it('rejects when nothing was stored', () => {
		expect(authModule.consumeStateMatches('abc123')).toBe(false);
	});

	// Omitting the param entirely must not read as "no check needed".
	it('rejects a missing state', () => {
		localStorage.setItem(STATE_KEY, 'abc123');
		expect(authModule.consumeStateMatches(null)).toBe(false);
	});

	it('rejects when neither side has a state', () => {
		expect(authModule.consumeStateMatches(null)).toBe(false);
	});

	// Single-use: a replayed redirect finds nothing left to match.
	it('consumes the state, so a replay fails', () => {
		localStorage.setItem(STATE_KEY, 'abc123');
		expect(authModule.consumeStateMatches('abc123')).toBe(true);
		expect(authModule.consumeStateMatches('abc123')).toBe(false);
	});
});

describe('signIn', () => {
	it('redirects to the consent page with a fresh state and the S256 challenge of the stored verifier', async () => {
		await authModule.signIn();

		const verifier = localStorage.getItem(VERIFIER_KEY);
		const storedState = localStorage.getItem(STATE_KEY);
		expect(verifier).toBeTruthy();
		expect(storedState).toBeTruthy();

		const url = new URL(assign.mock.calls[0][0]);
		expect(url.origin + url.pathname).toBe(AUTHORIZE_ENDPOINT);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: PUBLIC_STYTCH_CLIENT_ID,
			redirect_uri: `${ORIGIN}/auth/callback`,
			response_type: 'code',
			scope: 'openid email profile offline_access',
			state: storedState,
			code_challenge: await generateCodeChallenge(verifier!),
			code_challenge_method: 'S256'
		});
	});

	it('uses a different state and verifier for each attempt', async () => {
		await authModule.signIn();
		const first = [localStorage.getItem(STATE_KEY), localStorage.getItem(VERIFIER_KEY)];
		await authModule.signIn();
		const second = [localStorage.getItem(STATE_KEY), localStorage.getItem(VERIFIER_KEY)];

		expect(second[0]).not.toBe(first[0]);
		expect(second[1]).not.toBe(first[1]);
	});

	it('goes nowhere and stores nothing when discovery fails', async () => {
		oidcEndpoints.mockRejectedValue(new Error('OIDC discovery failed: 503'));

		await expect(authModule.signIn()).rejects.toThrow(/discovery/);

		expect(assign).not.toHaveBeenCalled();
		expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
		expect(localStorage.getItem(STATE_KEY)).toBeNull();
	});
});

describe('exchangeCodeForToken', () => {
	it('refuses to exchange without a verifier from signIn', async () => {
		await expect(authModule.exchangeCodeForToken('code-1')).rejects.toThrow(/code_verifier/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('trades the code and verifier for tokens and signs the user in', async () => {
		localStorage.setItem(VERIFIER_KEY, 'verifier-1');
		const access = tokenExpiringIn(3600, 'user-9');
		fetchMock.mockResolvedValue(
			tokenResponse({ access_token: access, refresh_token: 'r-1', id_token: 'id-1' })
		);

		await authModule.exchangeCodeForToken('code-1');

		expect(fetchMock.mock.calls[0][0]).toBe(TOKEN_ENDPOINT);
		expect(Object.fromEntries(sentForm())).toEqual({
			grant_type: 'authorization_code',
			client_id: PUBLIC_STYTCH_CLIENT_ID,
			code: 'code-1',
			code_verifier: 'verifier-1',
			redirect_uri: `${ORIGIN}/auth/callback`
		});
		expect(localStorage.getItem(ACCESS_KEY)).toBe(access);
		expect(localStorage.getItem(REFRESH_KEY)).toBe('r-1');
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBe('id-1');
		expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
		expect(authModule.auth.status).toBe('signed-in');
		expect(authModule.auth.user).toEqual({ id: 'user-9' });
	});

	it('signs in without a refresh token when none is issued', async () => {
		localStorage.setItem(VERIFIER_KEY, 'verifier-1');
		fetchMock.mockResolvedValue(tokenResponse({ access_token: tokenExpiringIn(3600) }));

		await authModule.exchangeCodeForToken('code-1');

		expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
		expect(authModule.auth.status).toBe('signed-in');
	});

	it("drops the previous session's refresh and ID tokens when the new response has none", async () => {
		localStorage.setItem(REFRESH_KEY, 'old-r');
		localStorage.setItem(ID_TOKEN_KEY, 'old-id');
		localStorage.setItem(VERIFIER_KEY, 'verifier-1');
		fetchMock.mockResolvedValue(tokenResponse({ access_token: tokenExpiringIn(3600) }));

		await authModule.exchangeCodeForToken('code-1');

		expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBeNull();
	});

	it('keeps the verifier for a retry when discovery fails', async () => {
		localStorage.setItem(VERIFIER_KEY, 'verifier-1');
		oidcEndpoints.mockRejectedValue(new Error('OIDC discovery failed: 503'));

		await expect(authModule.exchangeCodeForToken('code-1')).rejects.toThrow(/discovery/);

		expect(localStorage.getItem(VERIFIER_KEY)).toBe('verifier-1');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('fails without storing anything, and the verifier stays spent', async () => {
		localStorage.setItem(VERIFIER_KEY, 'verifier-1');
		fetchMock.mockResolvedValue(new Response('invalid_grant', { status: 400 }));

		await expect(authModule.exchangeCodeForToken('code-1')).rejects.toThrow(/400 invalid_grant/);

		expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
		expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
		expect(authModule.auth.status).not.toBe('signed-in');
	});
});

describe('initAuth', () => {
	it('starts out loading', () => {
		expect(authModule.auth.status).toBe('loading');
	});

	it('starts discovery early, so sign-in and sign-out rarely wait on it', async () => {
		await authModule.initAuth();
		expect(oidcEndpoints).toHaveBeenCalledOnce();
	});

	it('tolerates a failed early discovery', async () => {
		oidcEndpoints.mockRejectedValue(new Error('OIDC discovery failed: 503'));
		await authModule.initAuth();
		expect(authModule.auth.status).toBe('signed-out');
	});

	it('signs in from a stored token', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(3600, 'user-1'));

		await authModule.initAuth();

		expect(authModule.auth.user).toEqual({ id: 'user-1' });
	});

	it('keeps only the user id, even when the token carries an email', async () => {
		localStorage.setItem(
			ACCESS_KEY,
			jwt({ sub: 'user-1', email: 'jay@example.com', exp: 9999999999 })
		);

		await authModule.initAuth();

		expect(authModule.auth.user).toEqual({ id: 'user-1' });
	});

	it('is signed out with nothing stored', async () => {
		await authModule.initAuth();

		expect(authModule.auth.status).toBe('signed-out');
		expect(authModule.auth.user).toBeNull();
	});

	it.each([
		['not a jwt', 'garbage'],
		['an undecodable payload', 'a.%%%.c'],
		['a payload without sub', jwt({ exp: 9999999999 })],
		['a payload without exp', jwt({ sub: 'user-1' })]
	])('discards %s and signs out', async (_, token) => {
		localStorage.setItem(ACCESS_KEY, token);
		localStorage.setItem(REFRESH_KEY, 'r-1');

		await authModule.initAuth();

		expect(authModule.auth.status).toBe('signed-out');
		expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
		expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
	});

	it('signs out when storage is unavailable', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			}
		});

		await authModule.initAuth();

		expect(authModule.auth.status).toBe('signed-out');
	});

	it('only reads storage once across repeated calls', async () => {
		await authModule.initAuth();
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(3600));

		await authModule.initAuth();

		expect(authModule.auth.status).toBe('signed-out');
	});
});

describe('signOut', () => {
	it('drops every token and hands off to the end-session endpoint with the ID token as a hint', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(3600));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		localStorage.setItem(ID_TOKEN_KEY, 'id-1');
		await authModule.initAuth();

		await authModule.signOut();

		expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
		expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBeNull();
		expect(authModule.auth.status).toBe('signed-out');
		const url = new URL(assign.mock.calls[0][0]);
		expect(url.origin + url.pathname).toBe(END_SESSION_ENDPOINT);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: PUBLIC_STYTCH_CLIENT_ID,
			post_logout_redirect_uri: `${ORIGIN}/`,
			id_token_hint: 'id-1'
		});
	});

	it('still hands off without a hint when no ID token was stored', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(3600));

		await authModule.signOut();

		const url = new URL(assign.mock.calls[0][0]);
		expect(url.searchParams.has('id_token_hint')).toBe(false);
	});

	it('signs out locally even when discovery fails', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(3600));
		localStorage.setItem(ID_TOKEN_KEY, 'id-1');
		await authModule.initAuth();
		oidcEndpoints.mockRejectedValue(new Error('OIDC discovery failed: 503'));

		await expect(authModule.signOut()).rejects.toThrow(/discovery/);

		expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBeNull();
		expect(authModule.auth.status).toBe('signed-out');
		expect(assign).not.toHaveBeenCalled();
	});
});

describe('getAccessToken', () => {
	it('returns an empty string when signed out, so anonymous requests still go out', async () => {
		expect(await authModule.getAccessToken()).toBe('');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a token with time left as-is', async () => {
		const token = tokenExpiringIn(3600);
		localStorage.setItem(ACCESS_KEY, token);
		localStorage.setItem(REFRESH_KEY, 'r-1');

		expect(await authModule.getAccessToken()).toBe(token);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('discards a malformed token, signing out', async () => {
		localStorage.setItem(ACCESS_KEY, 'garbage');
		localStorage.setItem(REFRESH_KEY, 'r-1');

		expect(await authModule.getAccessToken()).toBe('');
		expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
		expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
		expect(authModule.auth.status).toBe('signed-out');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a near-expiry token unrefreshed when there is no refresh token', async () => {
		const token = tokenExpiringIn(30);
		localStorage.setItem(ACCESS_KEY, token);

		expect(await authModule.getAccessToken()).toBe(token);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		['within a minute of expiry', 30],
		['already expired', -600]
	])('refreshes a token %s and stores the rotated pair', async (_, expiresIn) => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(expiresIn));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		const fresh = tokenExpiringIn(3600, 'user-1');
		fetchMock.mockResolvedValue(tokenResponse({ access_token: fresh, refresh_token: 'r-2' }));

		expect(await authModule.getAccessToken()).toBe(fresh);

		expect(fetchMock.mock.calls[0][0]).toBe(TOKEN_ENDPOINT);
		expect(Object.fromEntries(sentForm())).toEqual({
			grant_type: 'refresh_token',
			client_id: PUBLIC_STYTCH_CLIENT_ID,
			refresh_token: 'r-1'
		});
		expect(localStorage.getItem(ACCESS_KEY)).toBe(fresh);
		expect(localStorage.getItem(REFRESH_KEY)).toBe('r-2');
		expect(authModule.auth.user).toEqual({ id: 'user-1' });
	});

	it('keeps the old refresh and ID tokens when the response does not rotate them', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(30));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		localStorage.setItem(ID_TOKEN_KEY, 'id-1');
		fetchMock.mockResolvedValue(tokenResponse({ access_token: tokenExpiringIn(3600) }));

		await authModule.getAccessToken();

		expect(localStorage.getItem(REFRESH_KEY)).toBe('r-1');
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBe('id-1');
	});

	it('replaces the ID token when a refresh returns a new one', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(30));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		localStorage.setItem(ID_TOKEN_KEY, 'id-1');

		fetchMock.mockResolvedValue(
			tokenResponse({
				access_token: tokenExpiringIn(3600),
				refresh_token: 'r-2',
				id_token: 'id-2'
			})
		);

		await authModule.getAccessToken();
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBe('id-2');
	});

	it('keeps the tokens when discovery fails, so a later refresh can retry', async () => {
		const token = tokenExpiringIn(30);
		localStorage.setItem(ACCESS_KEY, token);
		localStorage.setItem(REFRESH_KEY, 'r-1');
		oidcEndpoints.mockRejectedValue(new Error('OIDC discovery failed: 503'));

		await expect(authModule.getAccessToken()).rejects.toThrow(/discovery/);

		expect(localStorage.getItem(ACCESS_KEY)).toBe(token);
		expect(localStorage.getItem(REFRESH_KEY)).toBe('r-1');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	// Stytch rotates the refresh token per exchange, so a second concurrent
	// exchange would spend a token the first already invalidated.
	it('shares one refresh between concurrent callers', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(30));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		const fresh = tokenExpiringIn(3600);
		fetchMock.mockResolvedValue(tokenResponse({ access_token: fresh, refresh_token: 'r-2' }));

		const tokens = await Promise.all([
			authModule.getAccessToken(),
			authModule.getAccessToken(),
			authModule.getAccessToken()
		]);

		expect(tokens).toEqual([fresh, fresh, fresh]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refreshes again with the rotated token once the previous refresh has settled', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(30));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		fetchMock
			.mockResolvedValueOnce(
				tokenResponse({ access_token: tokenExpiringIn(30), refresh_token: 'r-2' })
			)
			.mockResolvedValueOnce(
				tokenResponse({ access_token: tokenExpiringIn(3600), refresh_token: 'r-3' })
			);

		await authModule.getAccessToken();
		await authModule.getAccessToken();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sentForm(1).get('refresh_token')).toBe('r-2');
		expect(localStorage.getItem(REFRESH_KEY)).toBe('r-3');
	});

	it('signs out and rejects every waiting caller when the refresh fails', async () => {
		localStorage.setItem(ACCESS_KEY, tokenExpiringIn(30));
		localStorage.setItem(REFRESH_KEY, 'r-1');
		localStorage.setItem(ID_TOKEN_KEY, 'id-1');
		await authModule.initAuth();
		fetchMock.mockResolvedValue(new Response('invalid_grant', { status: 400 }));

		const results = await Promise.allSettled([
			authModule.getAccessToken(),
			authModule.getAccessToken()
		]);

		expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
		expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
		expect(localStorage.getItem(ID_TOKEN_KEY)).toBeNull();
		expect(authModule.auth.status).toBe('signed-out');
	});
});

import { SvelteURLSearchParams } from 'svelte/reactivity';
import { PUBLIC_STYTCH_CLIENT_ID } from '$env/static/public';
import { oidcEndpoints } from './oidc';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce';

const CODE_VERIFIER_KEY = 'stytch_pkce_code_verifier';
const STATE_KEY = 'stytch_oauth_state';
const ACCESS_TOKEN_KEY = 'stytch_access_token';
const REFRESH_TOKEN_KEY = 'stytch_refresh_token';
const ID_TOKEN_KEY = 'stytch_id_token';

const REFRESH_SKEW_SECONDS = 60;

type User = { id: string; email: string | null };
type AuthState =
	{ status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: User };

let state = $state<AuthState>({ status: 'loading' });
let initPromise: Promise<void> | undefined;

type AccessTokenPayload = { sub: string; email?: string; exp: number };

function decodeAccessTokenPayload(token: string): AccessTokenPayload | null {
	try {
		const segment = token.split('.')[1];
		if (!segment) return null;
		const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));
		if (typeof payload?.sub !== 'string' || typeof payload?.exp !== 'number') return null;
		return payload;
	} catch {
		return null;
	}
}

function clearStoredTokens() {
	localStorage.removeItem(ACCESS_TOKEN_KEY);
	localStorage.removeItem(REFRESH_TOKEN_KEY);
	localStorage.removeItem(ID_TOKEN_KEY);
}

function syncFromStoredToken() {
	const token = localStorage.getItem(ACCESS_TOKEN_KEY);
	const payload = token ? decodeAccessTokenPayload(token) : null;
	if (token && !payload) clearStoredTokens();
	state = payload
		? { status: 'signed-in', user: { id: payload.sub, email: payload.email ?? null } }
		: { status: 'signed-out' };
}

export function initAuth(): Promise<void> {
	if (!initPromise) {
		oidcEndpoints().catch(() => {});
		initPromise = Promise.resolve().then(() => {
			try {
				syncFromStoredToken();
			} catch {
				state = { status: 'signed-out' };
			}
		});
	}
	return initPromise;
}

export async function signIn(): Promise<void> {
	const { authorization } = await oidcEndpoints();
	const verifier = generateCodeVerifier();
	const challenge = await generateCodeChallenge(verifier);
	localStorage.setItem(CODE_VERIFIER_KEY, verifier);

	// PKCE binds the code to this browser; `state` binds it to this specific
	// flow. Without it an attacker can feed their own code to the callback and
	// silently sign the victim into the attacker's account.
	const oauthState = generateState();
	localStorage.setItem(STATE_KEY, oauthState);

	const redirectUri = `${window.location.origin}/auth/callback`;
	const params = new SvelteURLSearchParams({
		client_id: PUBLIC_STYTCH_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile offline_access',
		state: oauthState,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	});

	window.location.assign(`${authorization}?${params.toString()}`);
}

// Consumes the stored `state` and reports whether the redirect's matches it.
// Fails closed: a missing stored value or a missing/mismatched returned one is
// a rejection, never a skipped check.
export function consumeStateMatches(returnedState: string | null): boolean {
	const expected = localStorage.getItem(STATE_KEY);
	localStorage.removeItem(STATE_KEY);
	return expected !== null && returnedState === expected;
}

export async function exchangeCodeForToken(code: string): Promise<void> {
	const verifier = localStorage.getItem(CODE_VERIFIER_KEY);
	if (!verifier) {
		throw new Error('No PKCE code_verifier found - signIn() was not called in this browser');
	}

	const { token } = await oidcEndpoints();
	localStorage.removeItem(CODE_VERIFIER_KEY);
	const redirectUri = `${window.location.origin}/auth/callback`;
	const response = await fetch(token, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new SvelteURLSearchParams({
			grant_type: 'authorization_code',
			client_id: PUBLIC_STYTCH_CLIENT_ID,
			code,
			code_verifier: verifier,
			redirect_uri: redirectUri
		})
	});

	if (!response.ok) {
		throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
	}

	clearStoredTokens();
	storeTokens(await response.json());
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string };

function storeTokens({ access_token, refresh_token, id_token }: TokenResponse): string {
	localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
	if (refresh_token) {
		localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
	}
	if (id_token) {
		localStorage.setItem(ID_TOKEN_KEY, id_token);
	}
	syncFromStoredToken();
	return access_token;
}

// Public PKCE client: Stytch rotates the refresh token on every exchange, so
// concurrent refreshes would each invalidate the others' token. Callers share
// one in-flight exchange instead.
let refreshInFlight: Promise<string> | undefined;

function refreshAccessToken(): Promise<string> {
	if (!refreshInFlight) {
		refreshInFlight = exchangeRefreshToken().finally(() => {
			refreshInFlight = undefined;
		});
	}
	return refreshInFlight;
}

async function exchangeRefreshToken(): Promise<string> {
	const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
	if (!refreshToken) {
		throw new Error('No refresh token available');
	}

	const { token } = await oidcEndpoints();
	const response = await fetch(token, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new SvelteURLSearchParams({
			grant_type: 'refresh_token',
			client_id: PUBLIC_STYTCH_CLIENT_ID,
			refresh_token: refreshToken
		})
	});

	if (!response.ok) {
		clearStoredTokens();
		syncFromStoredToken();
		throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
	}

	return storeTokens(await response.json());
}

export const auth = {
	get status() {
		return state.status;
	},
	get user() {
		return state.status === 'signed-in' ? state.user : null;
	}
};

export async function signOut(): Promise<void> {
	const idToken = localStorage.getItem(ID_TOKEN_KEY);
	clearStoredTokens();
	syncFromStoredToken();

	const { endSession } = await oidcEndpoints();
	const params = new SvelteURLSearchParams({
		client_id: PUBLIC_STYTCH_CLIENT_ID,
		post_logout_redirect_uri: `${window.location.origin}/`
	});
	if (idToken) {
		params.set('id_token_hint', idToken);
	}
	window.location.assign(`${endSession}?${params.toString()}`);
}

// Called per-request by the generated client. Returns '' when signed out
// rather than throwing: the client only sets the Authorization header on a
// truthy value, which lets anonymous-allowed endpoints still fire.
export async function getAccessToken(): Promise<string> {
	const token = localStorage.getItem(ACCESS_TOKEN_KEY);
	if (!token) {
		return '';
	}

	const payload = decodeAccessTokenPayload(token);
	if (!payload) {
		clearStoredTokens();
		syncFromStoredToken();
		return '';
	}

	if (payload.exp - Date.now() / 1000 > REFRESH_SKEW_SECONDS) {
		return token;
	}

	if (!localStorage.getItem(REFRESH_TOKEN_KEY)) {
		return token;
	}

	return await refreshAccessToken();
}

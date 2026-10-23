import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_OIDC_ISSUER } from '$app/env/public';

type OidcModule = typeof import('./oidc');
let oidc: OidcModule;
let fetchMock: ReturnType<typeof vi.fn>;

const configuration = {
	issuer: PUBLIC_OIDC_ISSUER,
	authorization_endpoint: 'https://idp.test/authorize',
	token_endpoint: `${PUBLIC_OIDC_ISSUER}/v1/oauth2/token`,
	end_session_endpoint: 'https://idp.test/authorize'
};

function discoveryResponse(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

beforeEach(async () => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	vi.resetModules();
	oidc = await import('./oidc');
});

describe('oidcEndpoints', () => {
	it("reads the endpoints from the issuer's discovery document", async () => {
		fetchMock.mockResolvedValue(discoveryResponse(configuration));

		expect(await oidc.oidcEndpoints()).toEqual({
			authorization: 'https://idp.test/authorize',
			token: `${PUBLIC_OIDC_ISSUER}/v1/oauth2/token`,
			endSession: 'https://idp.test/authorize'
		});
		expect(fetchMock).toHaveBeenCalledWith(
			`${PUBLIC_OIDC_ISSUER}/.well-known/openid-configuration`
		);
	});

	it('fetches the document once for every caller', async () => {
		fetchMock.mockResolvedValue(discoveryResponse(configuration));

		await Promise.all([oidc.oidcEndpoints(), oidc.oidcEndpoints()]);
		await oidc.oidcEndpoints();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('rejects a document for a different issuer', async () => {
		fetchMock.mockResolvedValue(
			discoveryResponse({ ...configuration, issuer: 'https://attacker.test' })
		);

		await expect(oidc.oidcEndpoints()).rejects.toThrow(/attacker\.test/);
	});

	it.each(['authorization_endpoint', 'token_endpoint', 'end_session_endpoint'])(
		'rejects a document without %s',
		async (field) => {
			fetchMock.mockResolvedValue(discoveryResponse({ ...configuration, [field]: undefined }));

			await expect(oidc.oidcEndpoints()).rejects.toThrow(/no \w+ endpoint/);
		}
	);

	it('fetches again after a failure instead of caching it', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
			.mockResolvedValueOnce(discoveryResponse(configuration));

		await expect(oidc.oidcEndpoints()).rejects.toThrow(/503/);
		expect((await oidc.oidcEndpoints()).token).toBe(configuration.token_endpoint);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

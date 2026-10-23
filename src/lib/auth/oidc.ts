import { PUBLIC_OIDC_ISSUER } from '$app/env/public';

export type OidcEndpoints = { authorization: string; token: string; endSession: string };

let discovery: Promise<OidcEndpoints> | undefined;

export function oidcEndpoints(): Promise<OidcEndpoints> {
	discovery ??= discover().catch((err) => {
		discovery = undefined;
		throw err;
	});
	return discovery;
}

async function discover(): Promise<OidcEndpoints> {
	const response = await fetch(`${PUBLIC_OIDC_ISSUER}/.well-known/openid-configuration`);
	if (!response.ok) {
		throw new Error(`OIDC discovery failed: ${response.status}`);
	}

	const config = await response.json();
	if (config?.issuer !== PUBLIC_OIDC_ISSUER) {
		throw new Error(`OIDC discovery returned issuer ${config?.issuer}, not ${PUBLIC_OIDC_ISSUER}`);
	}

	const endpoints = {
		authorization: config.authorization_endpoint,
		token: config.token_endpoint,
		endSession: config.end_session_endpoint
	};
	for (const [name, url] of Object.entries(endpoints)) {
		if (typeof url !== 'string') {
			throw new Error(`OIDC discovery has no ${name} endpoint`);
		}
	}
	return endpoints;
}

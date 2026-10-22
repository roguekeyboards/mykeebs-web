import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_KBDB_API_BASE_PATH: { public: true, static: true },
	PUBLIC_STYTCH_CLIENT_ID: { public: true, static: true },
	PUBLIC_OIDC_ISSUER: { public: true, static: true }
});

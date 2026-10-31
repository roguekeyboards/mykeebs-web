import type { sveltekit } from '@sveltejs/kit/vite';

type CspDirectives = NonNullable<
	NonNullable<NonNullable<Parameters<typeof sveltekit>[0]>['csp']>['directives']
>;
type CspSource = NonNullable<CspDirectives['connect-src']>[number];

export type Env = Record<string, string | undefined>;

export function cspDirectives(env: Env): CspDirectives {
	const host = (key: string) => origin(key, env[key]);
	return {
		'default-src': ['self'],
		'connect-src': [
			'self',
			host('PUBLIC_MYKEEBS_API_BASE_PATH'),
			host('PUBLIC_OIDC_ISSUER'),
			host('MYKEEBS_UPLOADS_ORIGIN')
		],
		'img-src': ['self', 'data:', 'blob:', host('MYKEEBS_IMAGES_ORIGIN')],
		'font-src': ['self', 'data:'],
		'script-src': ['self', 'wasm-unsafe-eval'],
		'style-src': ['self', 'unsafe-inline'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self']
	};
}

function origin(key: string, url: string | undefined): CspSource {
	if (!url) throw new Error(`${key} is not set; the CSP needs it`);
	if (url.includes('*')) throw new Error(`CSP host must be exact, not a wildcard: ${url}`);
	const parsed = new URL(url);
	if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
		throw new Error(`CSP host must use https: ${url}`);
	}
	return parsed.origin as CspSource;
}

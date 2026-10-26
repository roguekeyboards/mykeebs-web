import type { sveltekit } from '@sveltejs/kit/vite';

type CspDirectives = NonNullable<
	NonNullable<NonNullable<Parameters<typeof sveltekit>[0]>['csp']>['directives']
>;
type CspSource = NonNullable<CspDirectives['connect-src']>[number];

export interface CspHosts {
	api: string;
	issuer: string;
	uploads: string;
	images: string;
}

export function cspDirectives(hosts: CspHosts): CspDirectives {
	const [api, issuer, uploads, images] = [hosts.api, hosts.issuer, hosts.uploads, hosts.images].map(
		origin
	);
	return {
		'default-src': ['self'],
		'connect-src': ['self', api, issuer, uploads],
		'img-src': ['self', 'data:', 'blob:', images],
		'font-src': ['self', 'data:'],
		'script-src': ['self', 'wasm-unsafe-eval'],
		'style-src': ['self', 'unsafe-inline'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self']
	};
}

function origin(url: string): CspSource {
	if (url.includes('*')) throw new Error(`CSP host must be exact, not a wildcard: ${url}`);
	const parsed = new URL(url);
	if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
		throw new Error(`CSP host must use https: ${url}`);
	}
	return parsed.origin as CspSource;
}

import { describe, expect, it } from 'vitest';
import { cspDirectives, type CspHosts } from './csp';

const hosts: CspHosts = {
	api: 'https://api.mykeebs.info',
	issuer: 'https://auth.mykeebs.info/',
	uploads: 'https://kbdb-images-416860882648-kbdb-prod.s3.us-east-2.amazonaws.com',
	images: 'https://images.mykeebs.info'
};

describe('cspDirectives', () => {
	it('allows fetches only to the app, the API, the issuer and the uploads bucket', () => {
		expect(cspDirectives(hosts)['connect-src']).toEqual([
			'self',
			'https://api.mykeebs.info',
			'https://auth.mykeebs.info',
			'https://kbdb-images-416860882648-kbdb-prod.s3.us-east-2.amazonaws.com'
		]);
	});

	it('allows images from the app, inlined and staged images, and the images domain', () => {
		expect(cspDirectives(hosts)['img-src']).toEqual([
			'self',
			'data:',
			'blob:',
			'https://images.mykeebs.info'
		]);
	});

	it('allows the WASM encoder but no other script source', () => {
		expect(cspDirectives(hosts)['script-src']).toEqual(['self', 'wasm-unsafe-eval']);
	});

	it('reduces each host to its origin', () => {
		const directives = cspDirectives({ ...hosts, api: 'https://api.mykeebs.info/v1?x=1' });
		expect(directives['connect-src']).toContain('https://api.mykeebs.info');
	});

	it('rejects a wildcard host', () => {
		expect(() =>
			cspDirectives({ ...hosts, uploads: 'https://*.s3.us-east-2.amazonaws.com' })
		).toThrow(/wildcard/);
	});

	it('rejects a missing host', () => {
		expect(() => cspDirectives({ ...hosts, images: '' })).toThrow();
	});

	it('rejects a plain http host other than localhost', () => {
		expect(() => cspDirectives({ ...hosts, images: 'http://images.mykeebs.info' })).toThrow(
			/https/
		);
		expect(cspDirectives({ ...hosts, api: 'http://localhost:8080' })['connect-src']).toContain(
			'http://localhost:8080'
		);
	});
});

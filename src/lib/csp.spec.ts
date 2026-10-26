import { describe, expect, it } from 'vitest';
import { cspDirectives, type Env } from './csp';

const env: Env = {
	PUBLIC_KBDB_API_BASE_PATH: 'https://api.mykeebs.info',
	PUBLIC_OIDC_ISSUER: 'https://auth.mykeebs.info/',
	KBDB_UPLOADS_ORIGIN: 'https://kbdb-images-416860882648-kbdb-prod.s3.us-east-2.amazonaws.com',
	KBDB_IMAGES_ORIGIN: 'https://images.mykeebs.info'
};

describe('cspDirectives', () => {
	it('allows fetches only to the app, the API, the issuer and the uploads bucket', () => {
		expect(cspDirectives(env)['connect-src']).toEqual([
			'self',
			'https://api.mykeebs.info',
			'https://auth.mykeebs.info',
			'https://kbdb-images-416860882648-kbdb-prod.s3.us-east-2.amazonaws.com'
		]);
	});

	it('allows images from the app, inlined and staged images, and the images domain', () => {
		expect(cspDirectives(env)['img-src']).toEqual([
			'self',
			'data:',
			'blob:',
			'https://images.mykeebs.info'
		]);
	});

	it('allows the WASM encoder but no other script source', () => {
		expect(cspDirectives(env)['script-src']).toEqual(['self', 'wasm-unsafe-eval']);
	});

	it('reduces each host to its origin', () => {
		const directives = cspDirectives({
			...env,
			PUBLIC_KBDB_API_BASE_PATH: 'https://api.mykeebs.info/v1?x=1'
		});
		expect(directives['connect-src']).toContain('https://api.mykeebs.info');
	});

	it('names a missing or empty host', () => {
		expect(() => cspDirectives({ ...env, KBDB_IMAGES_ORIGIN: undefined })).toThrow(
			'KBDB_IMAGES_ORIGIN is not set'
		);
		expect(() => cspDirectives({ ...env, KBDB_UPLOADS_ORIGIN: '' })).toThrow(
			'KBDB_UPLOADS_ORIGIN is not set'
		);
	});

	it('rejects a wildcard host', () => {
		expect(() =>
			cspDirectives({ ...env, KBDB_UPLOADS_ORIGIN: 'https://*.s3.us-east-2.amazonaws.com' })
		).toThrow(/wildcard/);
	});

	it('rejects a plain http host other than localhost', () => {
		expect(() =>
			cspDirectives({ ...env, KBDB_IMAGES_ORIGIN: 'http://images.mykeebs.info' })
		).toThrow(/https/);
		expect(
			cspDirectives({ ...env, PUBLIC_KBDB_API_BASE_PATH: 'http://localhost:8080' })['connect-src']
		).toContain('http://localhost:8080');
	});
});

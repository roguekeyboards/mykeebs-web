import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { cspDirectives } from './src/lib/csp';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				// SPA mode: page content depends on runtime API calls and auth
				// state, not build-time data, so prerendering (adapter-static's
				// default) is wrong here - fallback serves index.html for all
				// non-prerendered routes and client-side routing takes over.
				adapter: adapter({ fallback: 'index.html' }),
				csp: {
					mode: 'hash',
					directives: cspDirectives({
						api: env.PUBLIC_KBDB_API_BASE_PATH,
						issuer: env.PUBLIC_OIDC_ISSUER,
						uploads: env.KBDB_UPLOADS_ORIGIN,
						images: env.KBDB_IMAGES_ORIGIN
					})
				}
			})
		],
		optimizeDeps: {
			// Pre-bundling moves the encoder away from its .wasm files.
			exclude: ['@jsquash/webp']
		},
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [{ browser: 'chromium', headless: true }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**'],
						// Browser mode has no dev-server page to define the globals
						// `$app/env/public` reads; kit generates this module to do it.
						setupFiles: ['.svelte-kit/generated/dev/env/service-worker.js']
					}
				},

				{
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});

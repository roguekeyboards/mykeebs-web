import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
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
			adapter: adapter({ fallback: 'index.html' })
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
				extends: './vite.config.ts',
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
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});

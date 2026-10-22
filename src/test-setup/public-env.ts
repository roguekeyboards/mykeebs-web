import { inject } from 'vitest';

// The dev server's page shell sets this global and SvelteKit's
// `$app/env/public` reads it in the browser; Vitest browser mode has no such
// shell.
(globalThis as Record<string, unknown>).__sveltekit_dev = { env: inject('publicEnv') };

declare module 'vitest' {
	export interface ProvidedContext {
		publicEnv: Record<string, string>;
	}
}

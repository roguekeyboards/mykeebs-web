import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionDuration } from './motion';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('motionDuration', () => {
	it('keeps the duration by default', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false }));

		expect(motionDuration(120)).toBe(120);
	});

	it('is 0 when reduced motion is preferred', () => {
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: query === '(prefers-reduced-motion: reduce)'
		}));

		expect(motionDuration(120)).toBe(0);
	});

	it('keeps the duration where there is no matchMedia, as in SSR', () => {
		expect(motionDuration(120)).toBe(120);
	});
});

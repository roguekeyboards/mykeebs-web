import { describe, expect, it } from 'vitest';
import { isAtOrUnder, isProfileTabActive } from './nav-active';

describe('isAtOrUnder', () => {
	it('matches the path itself and anything beneath it', () => {
		expect(isAtOrUnder('/u/jay', '/u/jay')).toBe(true);
		expect(isAtOrUnder('/u/jay/builds/kb-1', '/u/jay')).toBe(true);
	});

	it('does not match a sibling that merely shares the prefix', () => {
		expect(isAtOrUnder('/u/jay2', '/u/jay')).toBe(false);
		expect(isAtOrUnder('/u/jay2/keyboards', '/u/jay')).toBe(false);
	});
});

describe('isProfileTabActive', () => {
	const overview = '/u/jay';

	it('keeps Overview to the profile root', () => {
		expect(isProfileTabActive('/u/jay', overview, overview)).toBe(true);
		expect(isProfileTabActive('/u/jay/builds', overview, overview)).toBe(false);
	});

	it('keeps a section tab active beneath its route', () => {
		expect(isProfileTabActive('/u/jay/builds', '/u/jay/builds', overview)).toBe(true);
		expect(isProfileTabActive('/u/jay/builds/kb-1', '/u/jay/builds', overview)).toBe(true);
		expect(isProfileTabActive('/u/jay/keyboards', '/u/jay/builds', overview)).toBe(false);
	});
});

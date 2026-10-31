import { describe, expect, it } from 'vitest';
import { Visibility } from '@roguekeyboards/mykeebs-api-client';
import { mixedVisibilityMeta, visibilityMeta, visibilityOptions } from './visibility';

describe('visibilityMeta', () => {
	it('describes each visibility', () => {
		expect(visibilityMeta(Visibility.Public)).toEqual({
			class: 'visibility-public',
			label: 'Public',
			title: 'Visible to anyone'
		});
		expect(visibilityMeta(Visibility.Authenticated)?.label).toBe('Signed in');
		expect(visibilityMeta(Visibility.Private)?.title).toBe('Visible only to you');
	});

	it('is null when there is no visibility to describe', () => {
		expect(visibilityMeta(undefined)).toBeNull();
		expect(visibilityMeta('unknown' as Visibility)).toBeNull();
	});

	it('has a separate description for a mix of visibilities', () => {
		expect(mixedVisibilityMeta.label).toBe('Mixed');
	});
});

describe('visibilityOptions', () => {
	it('runs from least to most exposed', () => {
		expect(visibilityOptions).toEqual([
			Visibility.Private,
			Visibility.Authenticated,
			Visibility.Public
		]);
	});
});

import { describe, expect, it } from 'vitest';
import { ECPartType, type ECPart } from '@roguekeyboards/mykeebs-api-client';
import { EC_PART_TYPES, ecPartMaterial, ecPartSpecs, ecPartTypeLabel } from './ec-parts';

const part = (overrides: Partial<ECPart>): ECPart => ({
	id: 'ec-1',
	brand: 'Deskeys',
	name: 'Domes',
	partType: ECPartType.Domes,
	...overrides
});

describe('ecPartTypeLabel', () => {
	it('names every part type', () => {
		expect(EC_PART_TYPES.map(ecPartTypeLabel)).toEqual([
			'Domes',
			'Sliders',
			'Housings',
			'Springs',
			'Silencing rings'
		]);
	});
});

describe('ecPartMaterial', () => {
	it('reads the material of whichever sub-object the part carries', () => {
		expect(ecPartMaterial(part({ domes: { material: 'Silicone' } }))).toBe('Silicone');
		expect(
			ecPartMaterial(part({ partType: ECPartType.Rings, rings: { material: 'Rubber' } }))
		).toBe('Rubber');
		expect(ecPartMaterial(part({}))).toBeUndefined();
	});
});

describe('ecPartSpecs', () => {
	it('lists the set fields with their units, in order', () => {
		expect(
			ecPartSpecs(part({ domes: { weight: 45, material: 'Silicone', color: 'Red' } }))
		).toEqual(['45g', 'Silicone', 'Red']);
		expect(
			ecPartSpecs(
				part({ partType: ECPartType.Sliders, sliders: { size: '2U', stem: 'MX', material: 'POM' } })
			)
		).toEqual(['2U', 'MX', 'POM']);
		expect(ecPartSpecs(part({ partType: ECPartType.Rings, rings: { thickness: 0.3 } }))).toEqual([
			'0.3mm'
		]);
	});

	it('is empty when nothing is set', () => {
		expect(ecPartSpecs(part({ domes: {} }))).toEqual([]);
	});
});

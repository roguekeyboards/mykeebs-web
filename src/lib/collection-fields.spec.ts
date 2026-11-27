import { describe, expect, it } from 'vitest';
import {
	ECPartType,
	type Build,
	type ECPart,
	type Keyboard,
	type KeycapSet,
	type Switch
} from '@roguekeyboards/mykeebs-api-client';
import type { KeyboardBuildGroup } from './build-groups';
import {
	buildFields,
	ecPartFields,
	keyboardFields,
	keycapSetFields,
	switchFields
} from './collection-fields';
import type { SearchField } from './collection-filter';

function valuesByTag<T>(fields: SearchField<T>[], item: T) {
	return Object.fromEntries(fields.map((field) => [field.tag, field.values(item)]));
}

describe('collection fields', () => {
	it('reads a keyboard', () => {
		const keyboard: Keyboard = {
			id: 'kb-1',
			brand: 'NyxKeys',
			name: 'Athena',
			size: '65%',
			layout: 'WK',
			purchase: { vendor: 'NyxKeys', orderStatus: 'Delivered' }
		};

		expect(valuesByTag(keyboardFields, keyboard)).toEqual({
			name: ['Athena'],
			brand: ['NyxKeys'],
			size: ['65%'],
			layout: ['WK'],
			vendor: ['NyxKeys'],
			status: ['Delivered']
		});
	});

	it('reads a switch', () => {
		const sw: Switch = {
			id: 'sw-1',
			brand: 'Gateron',
			availableQuantity: 0,
			manufacturer: 'Gateron',
			name: 'Oil King',
			type: 'Linear',
			material: { topHousing: 'PC', bottomHousing: 'Nylon', stem: 'POM' },
			purchases: [{ vendor: 'Divinikey', orderStatus: 'Ordered' }]
		};

		expect(valuesByTag(switchFields, sw)).toEqual({
			name: ['Oil King'],
			brand: ['Gateron'],
			manufacturer: ['Gateron'],
			type: ['Linear'],
			material: ['PC', 'Nylon', 'POM'],
			top: ['PC'],
			bottom: ['Nylon'],
			stem: ['POM'],
			vendor: ['Divinikey'],
			status: ['Ordered'],
			available: []
		});
	});

	it('keeps switches with at least the asked-for number free', () => {
		const available = switchFields.find((field) => field.tag === 'available')!;
		const sw: Switch = {
			id: 'sw-3',
			brand: 'HMX',
			name: 'Aperol',
			type: 'Linear',
			availableQuantity: 90
		};

		expect(available.matches?.(sw, '90')).toBe(true);
		expect(available.matches?.(sw, ' 70 ')).toBe(true);
		expect(available.matches?.(sw, '91')).toBe(false);
	});

	it('reads the vendor and status of every purchase', () => {
		const sw: Switch = {
			id: 'sw-2',
			brand: 'Gateron',
			availableQuantity: 0,
			name: 'Oil King',
			type: 'Linear',
			purchases: [
				{ vendor: 'Divinikey', orderStatus: 'Delivered' },
				{ vendor: 'KBDfans', orderStatus: 'Ordered' }
			]
		};
		const part: ECPart = { ...sw, partType: ECPartType.Domes };

		const expected = { vendor: ['Divinikey', 'KBDfans'], status: ['Delivered', 'Ordered'] };
		expect(valuesByTag(switchFields, sw)).toMatchObject(expected);
		expect(valuesByTag(ecPartFields, part)).toMatchObject(expected);
	});

	it('reads an EC part, whatever its part type', () => {
		const domes: ECPart = {
			id: 'ec-1',
			brand: 'Deskeys',
			name: 'Silicone domes',
			partType: ECPartType.Domes,
			domes: { weight: 45, material: 'Silicone', color: 'Red' },
			purchases: [{ vendor: 'Deskeys', orderStatus: 'Delivered' }]
		};
		const sliders: ECPart = {
			id: 'ec-2',
			brand: 'Keebwerk',
			name: 'MX sliders',
			partType: ECPartType.Sliders,
			sliders: { size: '1U', stem: 'MX', material: 'POM' }
		};

		expect(valuesByTag(ecPartFields, domes)).toEqual({
			name: ['Silicone domes'],
			brand: ['Deskeys'],
			part: ['Domes'],
			material: ['Silicone'],
			color: ['Red'],
			vendor: ['Deskeys'],
			status: ['Delivered']
		});
		expect(valuesByTag(ecPartFields, sliders)).toMatchObject({
			part: ['Sliders'],
			material: ['POM'],
			color: [undefined]
		});
	});

	it("reads a keycap set, including every kit's name", () => {
		const set: KeycapSet = {
			id: 'set-1',
			brand: 'GMK',
			available: false,
			name: 'Olivia',
			profile: 'Cherry',
			material: 'DualShot ABS',
			orderStatus: 'Shipped',
			kits: [
				{ kitId: 'base', name: 'Base', purchase: { vendor: 'NovelKeys' } },
				{ kitId: 'novs', name: 'Novelties', purchase: { vendor: 'Dixie Mech' } }
			]
		};

		expect(valuesByTag(keycapSetFields, set)).toEqual({
			name: ['Olivia'],
			brand: ['GMK'],
			profile: ['Cherry'],
			material: ['DualShot ABS'],
			kit: ['Base', 'Novelties'],
			vendor: ['NovelKeys', 'Dixie Mech'],
			status: ['Shipped'],
			available: ['no']
		});
		expect(valuesByTag(keycapSetFields, { ...set, available: true }).available).toEqual(['yes']);
	});

	it('keeps keycap sets by whether they are free for a new build', () => {
		const available = keycapSetFields.find((field) => field.tag === 'available')!;
		const free: KeycapSet = { id: 'set-3', brand: 'GMK', name: 'Olivia', available: true };
		const used: KeycapSet = { ...free, available: false };

		expect(available.matches?.(free, 'yes')).toBe(true);
		expect(available.matches?.(free, 'no')).toBe(false);
		expect(available.matches?.(used, 'false')).toBe(true);
		expect(available.matches?.(used, 'o')).toBe(false);
	});

	it("reads a build's keyboard, and the parts, keycap sets and types of all its builds", () => {
		const current: Build = {
			id: 'b-2',
			keyboard: { id: 'kb-1', brand: 'NyxKeys', name: 'Athena' },
			buildType: 'MX',
			switches: [
				{ _switch: { id: 'sw-1', brand: 'Gateron', name: 'Oil King', type: 'Linear' }, count: 70 }
			],
			keycapSets: [{ id: 'set-1', brand: 'GMK', name: 'Olivia', kits: [] }]
		};
		const past: Build = {
			id: 'b-1',
			keyboard: current.keyboard,
			buildType: 'MX',
			switches: [
				{ _switch: { id: 'sw-2', brand: 'HMX', name: 'Yogurt S', type: 'Linear' }, count: 68 }
			]
		};
		const ec: Build = {
			id: 'b-0',
			keyboard: current.keyboard,
			buildType: 'EC',
			ecParts: [
				{
					ecPart: { id: 'ec-1', brand: 'Deskeys', name: 'Silicone domes', partType: 'domes' },
					count: 68
				}
			]
		};
		const group: KeyboardBuildGroup = {
			keyboardId: 'kb-1',
			current,
			builds: [current, past, ec],
			buildCount: 3,
			mixedVisibility: false
		};

		expect(valuesByTag(buildFields, group)).toEqual({
			keyboard: ['Athena'],
			switches: ['Oil King', 'Yogurt S'],
			ec: ['Silicone domes'],
			type: ['MX', 'MX', 'EC'],
			keycaps: ['Olivia']
		});
	});

	it('gives nothing for fields an item leaves out', () => {
		const bare: Keyboard = { id: 'kb-2', brand: 'Bowl', name: 'Manta' };
		const set: KeycapSet = { id: 'set-2', brand: 'SWG', available: false, name: 'Nord' };

		expect(valuesByTag(keyboardFields, bare).size).toEqual([undefined]);
		expect(valuesByTag(keycapSetFields, set).kit).toEqual([]);
	});
});

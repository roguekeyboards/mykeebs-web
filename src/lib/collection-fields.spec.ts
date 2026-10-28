import { describe, expect, it } from 'vitest';
import type { Build, Keyboard, KeycapSet, Switch } from '@rogueserenity/kbdb-api-client';
import type { KeyboardBuildGroup } from './build-groups';
import { buildFields, keyboardFields, keycapSetFields, switchFields } from './collection-fields';
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
			manufacturer: 'Gateron',
			name: 'Oil King',
			type: 'Linear',
			material: { topHousing: 'PC', bottomHousing: 'Nylon', stem: 'POM' },
			purchase: { vendor: 'Divinikey', orderStatus: 'Ordered' }
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
			status: ['Ordered']
		});
	});

	it("reads a keycap set, including every kit's name", () => {
		const set: KeycapSet = {
			id: 'set-1',
			brand: 'GMK',
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
			status: ['Shipped']
		});
	});

	it("reads a build's keyboard, and the switches and keycap sets of all its builds", () => {
		const current: Build = {
			id: 'b-2',
			keyboard: { id: 'kb-1', brand: 'NyxKeys', name: 'Athena' },
			switches: [
				{ _switch: { id: 'sw-1', brand: 'Gateron', name: 'Oil King', type: 'Linear' }, count: 70 }
			],
			keycapSets: [{ id: 'set-1', brand: 'GMK', name: 'Olivia', kits: [] }]
		};
		const past: Build = {
			id: 'b-1',
			keyboard: current.keyboard,
			switches: [
				{ _switch: { id: 'sw-2', brand: 'HMX', name: 'Yogurt S', type: 'Linear' }, count: 68 }
			]
		};
		const group: KeyboardBuildGroup = {
			keyboardId: 'kb-1',
			current,
			builds: [current, past],
			buildCount: 2,
			mixedVisibility: false
		};

		expect(valuesByTag(buildFields, group)).toEqual({
			keyboard: ['Athena'],
			switches: ['Oil King', 'Yogurt S'],
			keycaps: ['Olivia']
		});
	});

	it('gives nothing for fields an item leaves out', () => {
		const bare: Keyboard = { id: 'kb-2', brand: 'Bowl', name: 'Manta' };
		const set: KeycapSet = { id: 'set-2', brand: 'SWG', name: 'Nord' };

		expect(valuesByTag(keyboardFields, bare).size).toEqual([undefined]);
		expect(valuesByTag(keycapSetFields, set).kit).toEqual([]);
	});
});

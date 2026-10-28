import type { Keyboard, KeycapSet, Switch } from '@rogueserenity/kbdb-api-client';
import type { SearchField } from '#lib/collection-filter.js';
import type { KeyboardBuildGroup } from '#lib/build-groups.js';

export const keyboardFields: SearchField<Keyboard>[] = [
	{ tag: 'brand', description: 'Who makes the keyboard', values: (kb) => [kb.brand] },
	{ tag: 'size', description: 'Size, e.g. 65%', values: (kb) => [kb.size] },
	{ tag: 'layout', description: 'Layout, e.g. WK', values: (kb) => [kb.layout] },
	{ tag: 'status', description: 'Order status', values: (kb) => [kb.purchase?.orderStatus] }
];

export const switchFields: SearchField<Switch>[] = [
	{ tag: 'brand', description: 'Who sells the switch', values: (sw) => [sw.brand] },
	{ tag: 'manufacturer', description: 'Who makes the switch', values: (sw) => [sw.manufacturer] },
	{ tag: 'type', description: 'Linear, tactile or clicky', values: (sw) => [sw.type] },
	{ tag: 'status', description: 'Order status', values: (sw) => [sw.purchase?.orderStatus] }
];

export const keycapSetFields: SearchField<KeycapSet>[] = [
	{ tag: 'brand', description: 'Who makes the set', values: (set) => [set.brand] },
	{ tag: 'profile', description: 'Profile, e.g. Cherry', values: (set) => [set.profile] },
	{ tag: 'material', description: 'Material, e.g. PBT', values: (set) => [set.material] },
	{
		tag: 'kit',
		description: 'A kit in the set',
		values: (set) => set.kits?.map((kit) => kit.name) ?? []
	},
	{ tag: 'status', description: 'Order status', values: (set) => [set.orderStatus] }
];

export const buildFields: SearchField<KeyboardBuildGroup>[] = [
	{
		tag: 'keyboard',
		description: 'The keyboard built',
		values: (group) => [group.current.keyboard.name]
	},
	{
		tag: 'switches',
		description: 'Switches in the build',
		values: (group) => group.current.switches?.map((entry) => entry._switch.name) ?? []
	},
	{
		tag: 'keycaps',
		description: 'Keycap sets on the build',
		values: (group) => group.current.keycapSets?.map((set) => set.name) ?? []
	}
];

import type { ECPart, Keyboard, KeycapSet, Switch } from '@roguekeyboards/mykeebs-api-client';
import { ecPartMaterial, ecPartTypeLabel } from '#lib/ec-parts.js';
import type { SearchField } from '#lib/collection-filter.js';
import type { KeyboardBuildGroup } from '#lib/build-groups.js';

export const keyboardFields: SearchField<Keyboard>[] = [
	{ tag: 'name', description: "The keyboard's name", values: (kb) => [kb.name] },
	{ tag: 'brand', description: 'Who makes the keyboard', values: (kb) => [kb.brand] },
	{ tag: 'size', description: 'Size, e.g. 65%', values: (kb) => [kb.size] },
	{ tag: 'layout', description: 'Layout, e.g. WK', values: (kb) => [kb.layout] },
	{ tag: 'vendor', description: 'Where it was bought', values: (kb) => [kb.purchase?.vendor] },
	{ tag: 'status', description: 'Order status', values: (kb) => [kb.purchase?.orderStatus] }
];

export const switchFields: SearchField<Switch>[] = [
	{ tag: 'name', description: "The switch's name", values: (sw) => [sw.name] },
	{ tag: 'brand', description: 'Who sells the switch', values: (sw) => [sw.brand] },
	{ tag: 'manufacturer', description: 'Who makes the switch', values: (sw) => [sw.manufacturer] },
	{ tag: 'type', description: 'Linear, tactile or clicky', values: (sw) => [sw.type] },
	{
		tag: 'material',
		description: 'Any housing or stem material',
		values: (sw) => [sw.material?.topHousing, sw.material?.bottomHousing, sw.material?.stem]
	},
	{ tag: 'top', description: 'Top housing material', values: (sw) => [sw.material?.topHousing] },
	{
		tag: 'bottom',
		description: 'Bottom housing material',
		values: (sw) => [sw.material?.bottomHousing]
	},
	{ tag: 'stem', description: 'Stem material', values: (sw) => [sw.material?.stem] },
	{ tag: 'vendor', description: 'Where they were bought', values: (sw) => [sw.purchase?.vendor] },
	{ tag: 'status', description: 'Order status', values: (sw) => [sw.purchase?.orderStatus] }
];

export const ecPartFields: SearchField<ECPart>[] = [
	{ tag: 'name', description: "The part's name", values: (part) => [part.name] },
	{ tag: 'brand', description: 'Who sells the part', values: (part) => [part.brand] },
	{
		tag: 'part',
		description: 'Domes, sliders, housings, springs or rings',
		values: (part) => [ecPartTypeLabel(part.partType)]
	},
	{ tag: 'material', description: "The part's material", values: (part) => [ecPartMaterial(part)] },
	{ tag: 'color', description: 'Dome color', values: (part) => [part.domes?.color] },
	{
		tag: 'vendor',
		description: 'Where they were bought',
		values: (part) => [part.purchase?.vendor]
	},
	{ tag: 'status', description: 'Order status', values: (part) => [part.purchase?.orderStatus] }
];

export const keycapSetFields: SearchField<KeycapSet>[] = [
	{ tag: 'name', description: "The set's name", values: (set) => [set.name] },
	{ tag: 'brand', description: 'Who makes the set', values: (set) => [set.brand] },
	{ tag: 'profile', description: 'Profile, e.g. Cherry', values: (set) => [set.profile] },
	{ tag: 'material', description: 'Material, e.g. PBT', values: (set) => [set.material] },
	{
		tag: 'kit',
		description: 'A kit in the set',
		values: (set) => set.kits?.map((kit) => kit.name) ?? []
	},
	{
		tag: 'vendor',
		description: 'Where any kit was bought',
		values: (set) => set.kits?.map((kit) => kit.purchase?.vendor) ?? []
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
		description: 'Switches in any build of the keyboard',
		values: (group) =>
			group.builds.flatMap((build) => build.switches?.map((entry) => entry._switch.name) ?? [])
	},
	{
		tag: 'ec',
		description: 'EC parts in any build of the keyboard',
		values: (group) =>
			group.builds.flatMap((build) => build.ecParts?.map((entry) => entry.ecPart.name) ?? [])
	},
	{
		tag: 'type',
		description: 'Build type, e.g. MX or EC',
		values: (group) => group.builds.map((build) => build.buildType)
	},
	{
		tag: 'keycaps',
		description: 'Keycap sets on any build of the keyboard',
		values: (group) =>
			group.builds.flatMap((build) => build.keycapSets?.map((set) => set.name) ?? [])
	}
];

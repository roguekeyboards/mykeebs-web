import { Visibility } from '@roguekeyboards/kbdb-api-client';

export type VisibilityMeta = {
	class: string;
	label: string;
	title: string;
};

const metaByVisibility: Record<Visibility, VisibilityMeta> = {
	[Visibility.Public]: {
		class: 'visibility-public',
		label: 'Public',
		title: 'Visible to anyone'
	},
	[Visibility.Authenticated]: {
		class: 'visibility-authenticated',
		label: 'Signed in',
		title: 'Visible to signed-in users'
	},
	[Visibility.Private]: {
		class: 'visibility-private',
		label: 'Private',
		title: 'Visible only to you'
	}
};

export const mixedVisibilityMeta: VisibilityMeta = {
	class: 'visibility-mixed',
	label: 'Mixed',
	title: 'Builds differ in visibility'
};

export function visibilityMeta(visibility: Visibility | undefined): VisibilityMeta | null {
	return visibility ? (metaByVisibility[visibility] ?? null) : null;
}

// Least to most exposed, so the picker reads as a severity scale.
export const visibilityOptions: Visibility[] = [
	Visibility.Private,
	Visibility.Authenticated,
	Visibility.Public
];

import { getContext, setContext } from 'svelte';

// route/params rather than a resolved href: svelte/no-navigation-without-resolve
// can't trace a resolve() call across this context boundary.
export type ProfileSubNavItem = {
	route:
		| '/u/[username]'
		| '/u/[username]/keyboards'
		| '/u/[username]/switches'
		| '/u/[username]/ec-parts'
		| '/u/[username]/keycap-sets'
		| '/u/[username]/builds'
		| '/u/[username]/orders';
	username: string;
	label: string;
};

export type ProfileSubNavContext = {
	items: ProfileSubNavItem[];
};

const KEY = Symbol('profile-subnav-context');

export function setProfileSubNavContext(context: ProfileSubNavContext): void {
	setContext(KEY, context);
}

export function getProfileSubNavContext(): ProfileSubNavContext | undefined {
	return getContext<ProfileSubNavContext | undefined>(KEY);
}

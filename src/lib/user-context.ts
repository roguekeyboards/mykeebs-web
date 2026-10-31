import { getContext, setContext } from 'svelte';
import type { Profile } from '@roguekeyboards/mykeebs-api-client';

export type UserContext = {
	readonly userId: string;
	readonly username: string;
	readonly profile: Profile;
	readonly isOwnProfile: boolean;
	readonly showPrice: boolean;
};

const KEY = Symbol('user-context');

export function setUserContext(context: UserContext): void {
	setContext(KEY, context);
}

export function getUserContext(): UserContext {
	const context = getContext<UserContext | undefined>(KEY);
	if (!context) throw new Error('getUserContext() called outside a /u/[username] route');
	return context;
}

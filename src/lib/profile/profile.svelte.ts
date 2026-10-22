import type { Profile, ProfileInput } from '@rogueserenity/kbdb-api-client';
import { ResponseError } from '@rogueserenity/kbdb-api-client';
import { auth } from '#lib/auth/auth.svelte.js';
import { profilesApi } from '#lib/api/client.js';

type ProfileState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'none' }
	| { status: 'ready'; profile: Profile }
	| { status: 'error' };

let state = $state<ProfileState>({ status: 'idle' });
let loadedForUserId: string | undefined;

async function load(userId: string): Promise<void> {
	state = { status: 'loading' };
	try {
		const profile = await profilesApi.getProfile({ identifier: userId });
		state = { status: 'ready', profile };
	} catch (err) {
		if (err instanceof ResponseError && err.response.status === 404) {
			state = { status: 'none' };
		} else {
			state = { status: 'error' };
		}
	}
}

/** Call once, from the root layout's onMount. */
export function initProfile(): void {
	$effect.root(() => {
		$effect(() => {
			const userId = auth.user?.id;
			if (!userId) {
				state = { status: 'idle' };
				loadedForUserId = undefined;
				return;
			}
			if (userId === loadedForUserId) return;
			loadedForUserId = userId;
			load(userId);
		});
	});
}

export async function refreshProfile(): Promise<void> {
	const userId = auth.user?.id;
	if (userId) await load(userId);
}

export async function saveProfile(input: ProfileInput): Promise<Profile> {
	const userId = auth.user?.id;
	if (!userId) throw new Error('Not signed in');

	const existing = state.status === 'ready';
	const profile = existing
		? await profilesApi.updateProfile({ identifier: userId, profileInput: input })
		: await profilesApi.createProfile({ identifier: userId, profileInput: input });
	state = { status: 'ready', profile };
	return profile;
}

export const profile = {
	get status() {
		return state.status;
	},
	get data() {
		return state.status === 'ready' ? state.profile : null;
	}
};

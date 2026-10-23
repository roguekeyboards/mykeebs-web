import { profilesApi } from '#lib/api/client.js';
import { signOut } from '#lib/auth/auth.svelte.js';

export async function deleteAccount(userId: string): Promise<void> {
	await profilesApi.deleteProfile({ identifier: userId });
	await signOut();
}

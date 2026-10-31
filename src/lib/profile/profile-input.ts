import type { ProfileLink } from '@roguekeyboards/mykeebs-api-client';

// Mirrors ProfileInput.username in mykeebs-api's schema: 3-32 chars, lowercase
// alphanumeric, single separators only, no leading/trailing separator.
const USERNAME_PATTERN = /^(?=.{3,32}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const USERNAME_RULES =
	'3–32 chars: lowercase letters, digits, hyphen, period, underscore. No leading/trailing or consecutive periods/hyphens/underscores. Cannot start with "user-".';

export function usernameLooksValid(username: string): boolean {
	return USERNAME_PATTERN.test(username) && !username.startsWith('user-');
}

export function cleanLinks(links: ProfileLink[]): { links: ProfileLink[] } | { error: string } {
	const cleaned = links
		.map((link) => ({ name: link.name.trim(), url: link.url.trim() }))
		.filter((link) => link.name || link.url);
	if (cleaned.some((link) => !link.name || !link.url)) {
		return { error: 'Each link needs both a name and a URL.' };
	}
	if (cleaned.some((link) => !/^https:\/\//i.test(link.url))) {
		return { error: 'Link URLs must start with https://.' };
	}
	return { links: cleaned };
}

import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { PUBLIC_KBDB_API_BASE_PATH } from '$app/env/public';
import ContactPage from './+page.svelte';

const kbdbOrigin = new URL(PUBLIC_KBDB_API_BASE_PATH).origin;

describe('Contact page', () => {
	it('gives the support address as a mail link', async () => {
		await render(ContactPage);

		await expect
			.element(page.getByRole('link', { name: 'support@mykeebs.com' }))
			.toHaveAttribute('href', 'mailto:support@mykeebs.com');
	});

	it("links kbdb's MCP guide and privacy policy", async () => {
		await render(ContactPage);

		await expect
			.element(page.getByRole('link', { name: 'guide to using mykeebs with AI' }))
			.toHaveAttribute('href', `${kbdbOrigin}/help/mcp`);
		await expect
			.element(page.getByRole('link', { name: 'privacy policy' }))
			.toHaveAttribute('href', `${kbdbOrigin}/privacy`);
	});

	it('points account deletion at the profile settings', async () => {
		await render(ContactPage);

		await expect
			.element(page.getByRole('link', { name: 'profile settings' }))
			.toHaveAttribute('href', '/profile/edit');
	});

	it('titles the page', async () => {
		await render(ContactPage);

		expect(document.title).toBe('Contact · mykeebs');
	});
});

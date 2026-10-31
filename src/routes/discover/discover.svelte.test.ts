import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Profile, ProfileListPage } from '@roguekeyboards/mykeebs-api-client';
import { profilesApi } from '#lib/api/client.js';
import DiscoverPage from './+page.svelte';

vi.mock('#lib/api/client.js', () => ({ profilesApi: { listProfiles: vi.fn() } }));

const listProfiles = vi.mocked(profilesApi.listProfiles);

function profile(username: string, discordUsername?: string): Profile {
	return { userId: `id-${username}`, username, discordUsername, discoverable: true };
}

function pageOf(items: Profile[], nextCursor?: string): ProfileListPage {
	return { items, nextCursor };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('Discover page', () => {
	beforeEach(() => {
		listProfiles.mockReset();
	});

	it('lists the whole directory on load, linking each builder to their profile', async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity', 'rogue#1')]));

		await render(DiscoverPage);

		const link = page.getByRole('link', { name: /@rogue\.serenity/ });
		await expect.element(link).toHaveAttribute('href', '/u/rogue.serenity');
		await expect.element(link).toMatchTextContent('rogue#1');
		expect(listProfiles).toHaveBeenCalledWith({ username: undefined });
	});

	it('searches by the trimmed username as the user types', async () => {
		listProfiles.mockResolvedValue(pageOf([]));
		await render(DiscoverPage);
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));

		listProfiles.mockResolvedValue(pageOf([profile('keebfan')]));
		await userEvent.fill(page.getByRole('searchbox'), '  keeb ');

		await expect.element(page.getByText('@keebfan')).toBeInTheDocument();
		expect(listProfiles).toHaveBeenLastCalledWith({ username: 'keeb' });
	});

	it('says so when no builders match', async () => {
		listProfiles.mockResolvedValue(pageOf([]));

		await render(DiscoverPage);

		await expect
			.element(page.getByRole('status').filter({ hasText: 'No builders match that search.' }))
			.toBeInTheDocument();
	});

	it('says so when the directory fails to load', async () => {
		listProfiles.mockRejectedValue(new Error('network'));

		await render(DiscoverPage);

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not load the directory.' }))
			.toBeInTheDocument();
	});

	it('appends the next page, keeping the search filter, until there are no more', async () => {
		listProfiles.mockResolvedValue(pageOf([]));
		await render(DiscoverPage);
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));

		listProfiles.mockResolvedValueOnce(pageOf([profile('alpha')], 'cursor-2'));
		await userEvent.fill(page.getByRole('searchbox'), 'a');
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();

		listProfiles.mockResolvedValueOnce(pageOf([profile('anna')]));
		await userEvent.click(page.getByRole('button', { name: 'Load more' }));

		await expect.element(page.getByText('@anna')).toBeInTheDocument();
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();
		expect(listProfiles).toHaveBeenLastCalledWith({ username: 'a', cursor: 'cursor-2' });
		await expect.element(page.getByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
	});

	it('loads more for the search on screen, even while a newer one is pending', async () => {
		listProfiles.mockResolvedValue(pageOf([]));
		await render(DiscoverPage);
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));

		listProfiles.mockResolvedValueOnce(pageOf([profile('alpha')], 'cursor-2'));
		await userEvent.fill(page.getByRole('searchbox'), 'a');
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();

		listProfiles.mockResolvedValueOnce(pageOf([profile('anna')]));
		await userEvent.fill(page.getByRole('searchbox'), 'ab');
		await userEvent.click(page.getByRole('button', { name: 'Load more' }));

		expect(listProfiles).toHaveBeenCalledWith({ username: 'a', cursor: 'cursor-2' });
	});

	it('re-enables Load more when a new search replaces one that was still loading more', async () => {
		listProfiles.mockResolvedValue(pageOf([]));
		await render(DiscoverPage);
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));

		listProfiles.mockResolvedValueOnce(pageOf([profile('alpha')], 'cursor-2'));
		await userEvent.fill(page.getByRole('searchbox'), 'a');
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();

		const pendingMore = deferred<ProfileListPage>();
		listProfiles.mockReturnValueOnce(pendingMore.promise);
		await userEvent.click(page.getByRole('button', { name: 'Load more' }));
		await expect.element(page.getByRole('button', { name: 'Loading…' })).toBeDisabled();

		listProfiles.mockResolvedValueOnce(pageOf([profile('bravo')], 'cursor-b2'));
		await userEvent.fill(page.getByRole('searchbox'), 'b');
		await expect.element(page.getByText('@bravo')).toBeInTheDocument();
		pendingMore.resolve(pageOf([profile('anna')]));
		await pendingMore.promise;

		await expect.element(page.getByRole('button', { name: 'Load more' })).toBeEnabled();
		await expect.element(page.getByText('@anna')).not.toBeInTheDocument();
	});

	it('keeps the loaded results when loading more fails, and lets the user retry', async () => {
		listProfiles.mockResolvedValueOnce(pageOf([profile('alpha')], 'cursor-2'));
		await render(DiscoverPage);
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();

		listProfiles.mockRejectedValueOnce(new Error('network'));
		await userEvent.click(page.getByRole('button', { name: 'Load more' }));

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not load more results.' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();

		listProfiles.mockResolvedValueOnce(pageOf([profile('anna')]));
		await userEvent.click(page.getByRole('button', { name: 'Try again' }));

		await expect.element(page.getByText('@anna')).toBeInTheDocument();
		await expect.element(page.getByText('@alpha')).toBeInTheDocument();
		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not load more results.' }))
			.not.toBeInTheDocument();
		expect(listProfiles).toHaveBeenLastCalledWith({ username: undefined, cursor: 'cursor-2' });
	});

	it("doesn't let a slow earlier search overwrite a newer one", async () => {
		listProfiles.mockResolvedValue(pageOf([]));
		await render(DiscoverPage);
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));

		const slow = deferred<ProfileListPage>();
		listProfiles.mockReturnValueOnce(slow.promise);
		await userEvent.fill(page.getByRole('searchbox'), 'ol');
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(2));

		listProfiles.mockResolvedValueOnce(pageOf([profile('newer')]));
		await userEvent.fill(page.getByRole('searchbox'), 'new');
		await expect.element(page.getByText('@newer')).toBeInTheDocument();

		slow.resolve(pageOf([profile('older')]));
		await slow.promise;

		await expect.element(page.getByText('@newer')).toBeInTheDocument();
		await expect.element(page.getByText('@older')).not.toBeInTheDocument();
	});
});

describe('Discover page title', () => {
	it('titles the tab', async () => {
		listProfiles.mockResolvedValue(pageOf([]));

		await render(DiscoverPage);

		await vi.waitFor(() => expect(document.title).toBe('Discover · mykeebs'));
	});
});

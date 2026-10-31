import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Profile, ProfileListPage } from '@roguekeyboards/mykeebs-api-client';
import { goto } from '$app/navigation';
import { profilesApi } from '#lib/api/client.js';
import BuilderSearch from './BuilderSearch.svelte';

vi.mock('#lib/api/client.js', () => ({ profilesApi: { listProfiles: vi.fn() } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const listProfiles = vi.mocked(profilesApi.listProfiles);

function profile(username: string, discordUsername?: string): Profile {
	return { userId: `id-${username}`, username, discordUsername, discoverable: true };
}

function pageOf(items: Profile[]): ProfileListPage {
	return { items };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

const searchbox = () => page.getByRole('searchbox');

describe('BuilderSearch.svelte', () => {
	beforeEach(() => {
		listProfiles.mockReset();
		vi.mocked(goto).mockReset();
	});

	it('looks up the trimmed username, six at most, and lists the matches', async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity', 'rogue#1')]));
		await render(BuilderSearch);

		await userEvent.fill(searchbox(), ' rog ');

		const match = page.getByRole('button', { name: /@rogue\.serenity/ });
		await expect.element(match).toMatchTextContent('rogue#1');
		expect(listProfiles).toHaveBeenCalledWith({ username: 'rog', limit: 6 });
	});

	it("goes to the picked builder's profile and clears the search", async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity')]));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');

		await userEvent.click(page.getByRole('button', { name: /@rogue\.serenity/ }));

		expect(goto).toHaveBeenCalledWith('/u/rogue.serenity');
		await expect.element(searchbox()).toHaveValue('');
		await expect.element(page.getByRole('button')).not.toBeInTheDocument();
	});

	it('sends no further search when a result is picked while one is still queued', async () => {
		listProfiles.mockResolvedValueOnce(pageOf([profile('rogue.serenity')]));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		const match = page.getByRole('button', { name: /@rogue\.serenity/ });
		await expect.element(match).toBeInTheDocument();

		await userEvent.fill(searchbox(), 'rogu');
		await userEvent.click(match);
		await new Promise((r) => setTimeout(r, 400));

		expect(listProfiles).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('button')).not.toBeInTheDocument();
	});

	it('says so when no builders match', async () => {
		listProfiles.mockResolvedValue(pageOf([]));
		await render(BuilderSearch);

		await userEvent.fill(searchbox(), 'zzz');

		await expect
			.element(page.getByRole('status').filter({ hasText: 'No builders match that search.' }))
			.toBeInTheDocument();
	});

	it('says the search failed rather than showing nothing or a false no-match', async () => {
		listProfiles.mockRejectedValueOnce(new Error('network'));
		await render(BuilderSearch);

		await userEvent.fill(searchbox(), 'rog');

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Search failed. Try again.' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('status').filter({ hasText: 'No builders match that search.' }))
			.not.toBeInTheDocument();
	});

	it('clears the failure once a later search succeeds', async () => {
		listProfiles.mockRejectedValueOnce(new Error('network'));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Search failed. Try again.' }))
			.toBeInTheDocument();

		listProfiles.mockResolvedValueOnce(pageOf([profile('rogue.serenity')]));
		await userEvent.fill(searchbox(), 'rogu');

		await expect.element(page.getByText('@rogue.serenity')).toBeInTheDocument();
		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Search failed. Try again.' }))
			.not.toBeInTheDocument();
	});

	it("doesn't search for blank input", async () => {
		await render(BuilderSearch);

		await userEvent.fill(searchbox(), '   ');
		await new Promise((r) => setTimeout(r, 400));

		expect(listProfiles).not.toHaveBeenCalled();
	});

	it('stays closed when the box is cleared before a search comes back', async () => {
		const pending = deferred<ProfileListPage>();
		listProfiles.mockReturnValueOnce(pending.promise);
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledOnce());

		await userEvent.clear(searchbox());
		pending.resolve(pageOf([profile('rogue.serenity')]));
		await pending.promise;

		await expect.element(page.getByText('@rogue.serenity')).not.toBeInTheDocument();
	});

	it("doesn't let a slow earlier search overwrite a newer one", async () => {
		const slow = deferred<ProfileListPage>();
		listProfiles.mockReturnValueOnce(slow.promise);
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'ol');
		await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledOnce());

		listProfiles.mockResolvedValueOnce(pageOf([profile('newer')]));
		await userEvent.fill(searchbox(), 'new');
		await expect.element(page.getByText('@newer')).toBeInTheDocument();

		slow.resolve(pageOf([profile('older')]));
		await slow.promise;

		await expect.element(page.getByText('@newer')).toBeInTheDocument();
		await expect.element(page.getByText('@older')).not.toBeInTheDocument();
	});

	it('closes the results when focus leaves, and reopens them on focus', async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity')]));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		await expect.element(page.getByText('@rogue.serenity')).toBeInTheDocument();

		(searchbox().element() as HTMLInputElement).blur();
		await expect.element(page.getByText('@rogue.serenity')).not.toBeInTheDocument();

		await userEvent.click(searchbox());
		await expect.element(page.getByText('@rogue.serenity')).toBeInTheDocument();
		expect(listProfiles).toHaveBeenCalledOnce();
	});

	it('stays open when Tab moves focus into the results, and Enter picks one', async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity')]));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		const match = page.getByRole('button', { name: /@rogue\.serenity/ });
		await expect.element(match).toBeInTheDocument();

		await userEvent.tab();
		await new Promise((r) => setTimeout(r, 300));

		await expect.element(match).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		expect(goto).toHaveBeenCalledWith('/u/rogue.serenity');
	});

	it('closes when Tab moves focus past the results', async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity')]));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		await expect.element(page.getByText('@rogue.serenity')).toBeInTheDocument();

		await userEvent.tab();
		await userEvent.tab();

		await expect.element(page.getByText('@rogue.serenity')).not.toBeInTheDocument();
	});

	it('keeps focus in the box while a result is pressed with the mouse', async () => {
		listProfiles.mockResolvedValue(pageOf([profile('rogue.serenity')]));
		await render(BuilderSearch);
		await userEvent.fill(searchbox(), 'rog');
		const match = page.getByRole('button', { name: /@rogue\.serenity/ });
		await expect.element(match).toBeInTheDocument();

		const pressed = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		match.element().dispatchEvent(pressed);

		expect(pressed.defaultPrevented).toBe(true);
		await expect.element(searchbox()).toHaveFocus();
		await expect.element(match).toBeInTheDocument();
	});
});

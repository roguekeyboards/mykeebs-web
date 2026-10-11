import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ResponseError, Visibility, type Build } from '@rogueserenity/kbdb-api-client';
import { buildsApi, keyboardsApi, keycapSetsApi, switchesApi } from '$lib/api/client';
import { STALE_REFS_MESSAGE } from '$lib/build-refs';
import WithUserContext from '$lib/components/test-support/WithUserContext.svelte';
import KeyboardBuildsPage from './+page.svelte';

vi.mock('$lib/image-resize', () => ({
	prepareImage: async (file: File) =>
		new File([file], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
}));

vi.mock('$app/state', () => ({
	page: { params: { username: 'rogue.serenity', keyboardId: 'kb-1' } }
}));
vi.mock('$lib/api/client', () => ({
	buildsApi: {
		listBuilds: vi.fn(),
		getBuild: vi.fn(),
		updateBuild: vi.fn(),
		deleteBuild: vi.fn(),
		createBuildImage: vi.fn(),
		deleteBuildImage: vi.fn()
	},
	keyboardsApi: { getKeyboard: vi.fn() },
	switchesApi: { getSwitch: vi.fn() },
	keycapSetsApi: { getKeycapSet: vi.fn() },
	lookupsApi: { getLookup: vi.fn(async () => ({ values: [] })) }
}));

const builds = vi.mocked(buildsApi);

const neo65 = { id: 'kb-1', brand: 'Qwertykeys', name: 'Neo65 Cu' };

function build(id: string, buildDate?: string, extra: Partial<Build> = {}): Build {
	return {
		id,
		visibility: Visibility.Public,
		keyboard: neo65,
		buildDate: buildDate ? new Date(`${buildDate}T12:00:00Z`) : undefined,
		...extra
	};
}

const current = build('b-new', '2026-06-30', {
	totalCost: 405.45,
	currency: 'USD',
	switches: [
		{
			_switch: { id: 'sw-1', brand: 'Keygeek', name: 'Ding Ding', type: 'Linear' },
			count: 67
		}
	],
	keycapSets: [
		{ id: 'set-1', brand: 'GMK', name: 'Fremen', kits: [{ kitId: 'base', name: 'Base' }] }
	],
	images: [
		{ imageId: 'img-1', url: 'https://img.example/1.png' },
		{ imageId: 'img-2', url: 'https://img.example/2.png' }
	]
});
const older = build('b-old', '2025-11-02');
const undated = build('b-undated');

function renderPage(isOwnProfile = true) {
	render(WithUserContext, { component: KeyboardBuildsPage, isOwnProfile });
}

const dialog = () => page.getByRole('dialog').last();

async function openCurrent() {
	await page.getByRole('button', { name: /Jun 30, 2026/ }).click();
	await expect.element(dialog().getByRole('button', { name: /Ding Ding/ })).toBeInTheDocument();
}

beforeEach(() => {
	vi.clearAllMocks();
	builds.listBuilds.mockResolvedValue({ items: [older, undated, current] });
	builds.getBuild.mockResolvedValue(current);
	vi.mocked(keyboardsApi.getKeyboard).mockResolvedValue(neo65);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('keyboard builds page', () => {
	it('heads the page with the keyboard and lists its builds newest first', async () => {
		renderPage();

		await expect
			.element(page.getByRole('heading', { name: 'Neo65 Cu', level: 2 }))
			.toBeInTheDocument();
		await expect.element(page.getByText('Qwertykeys')).toBeInTheDocument();
		const items = page.getByRole('listitem');
		await expect.element(items.nth(0)).toHaveTextContent(/Jun 30, 2026\s*Current/);
		await expect.element(items.nth(0)).toHaveTextContent('$405.45');
		await expect.element(items.nth(1)).toHaveTextContent('Nov 2, 2025');
		await expect.element(items.nth(2)).toHaveTextContent('Undated');
		expect(builds.listBuilds).toHaveBeenCalledWith({
			userId: 'user-1',
			keyboardId: 'kb-1',
			cursor: undefined
		});
	});

	it('follows the cursor to load every build', async () => {
		builds.listBuilds
			.mockResolvedValueOnce({ items: [current], nextCursor: 'c-2' })
			.mockResolvedValueOnce({ items: [older] });
		renderPage();

		await expect.element(page.getByRole('listitem').nth(1)).toHaveTextContent('Nov 2, 2025');
		expect(builds.listBuilds).toHaveBeenLastCalledWith({
			userId: 'user-1',
			keyboardId: 'kb-1',
			cursor: 'c-2'
		});
	});

	it('still lists the builds of a keyboard that was deleted', async () => {
		vi.mocked(keyboardsApi.getKeyboard).mockRejectedValue(new Error('not found'));
		renderPage();

		await expect
			.element(page.getByRole('heading', { name: 'Deleted keyboard', level: 2 }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('listitem')).toHaveLength(3);
	});

	it('says so when the keyboard has no builds', async () => {
		builds.listBuilds.mockResolvedValue({ items: [] });
		renderPage();

		await expect.element(page.getByText('No builds for this keyboard.')).toBeInTheDocument();
	});

	it('says so when the builds fail to load', async () => {
		builds.listBuilds.mockRejectedValue(new Error('network'));
		renderPage();

		await expect
			.element(
				page.getByRole('alert').filter({ hasText: 'Could not load builds for this keyboard.' })
			)
			.toBeInTheDocument();
	});

	it("heads the keyboard section one level below the profile's h1", async () => {
		renderPage();

		await expect
			.element(page.getByRole('heading', { level: 2, name: 'Neo65 Cu' }))
			.toBeInTheDocument();
		expect(document.querySelectorAll('h1')).toHaveLength(0);
	});

	it('keeps the decorative timeline dots out of the Tab order', async () => {
		renderPage();
		await expect.element(page.getByRole('button', { name: /Jun 30, 2026/ })).toBeInTheDocument();

		const dots = [...document.querySelectorAll<HTMLElement>('.kc-build-timeline-dot')];
		expect(dots.length).toBeGreaterThan(0);
		for (const dot of dots) expect(dot.tabIndex).toBe(-1);
	});

	describe('a build', () => {
		it('opens with edit and delete for the owner', async () => {
			renderPage();
			await openCurrent();

			expect(builds.getBuild).toHaveBeenCalledWith({ userId: 'user-1', buildId: 'b-new' });
			await expect.element(dialog().getByRole('button', { name: 'Edit' })).toBeInTheDocument();
			await expect.element(dialog().getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		});

		it('opens read-only for a visitor', async () => {
			renderPage(false);
			await openCurrent();

			await expect.element(dialog().getByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
			await expect
				.element(dialog().getByRole('button', { name: 'Delete' }))
				.not.toBeInTheDocument();
		});

		it('says so when the build fails to load', async () => {
			builds.getBuild.mockRejectedValue(new Error('network'));
			renderPage();

			await page.getByRole('button', { name: /Jun 30, 2026/ }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not load this build.' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('dialog', { name: 'Build' })).toBeInTheDocument();
		});

		it('opens a photo full size', async () => {
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'View full size image' }).nth(1).click();

			await expect.element(page.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
		});
	});

	describe('deleting a build', () => {
		it('asks first, then deletes, reloads, and closes', async () => {
			builds.deleteBuild.mockResolvedValue(undefined);
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'Delete' }).click();
			await expect.element(page.getByText('Delete this build?')).toBeInTheDocument();
			builds.listBuilds.mockResolvedValue({ items: [older, undated] });
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect.element(page.getByRole('listitem')).toHaveLength(2);
			expect(builds.deleteBuild).toHaveBeenCalledWith({ userId: 'user-1', buildId: 'b-new' });
		});

		it('says so when the delete fails', async () => {
			builds.deleteBuild.mockRejectedValue(new Error('network'));
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'Delete' }).click();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not delete this build.' }))
				.toBeInTheDocument();
		});
	});

	describe('editing a build', () => {
		it('saves, reloads, and returns to the build', async () => {
			builds.updateBuild.mockResolvedValue(current);
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect.element(dialog().getByRole('button', { name: 'Edit' })).toBeInTheDocument();
			expect(builds.updateBuild).toHaveBeenCalledWith(
				expect.objectContaining({ userId: 'user-1', buildId: 'b-new' })
			);
			expect(builds.listBuilds).toHaveBeenCalledTimes(2);
		});

		it('asks before closing with unsaved edits', async () => {
			renderPage();
			await openCurrent();
			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByLabelText('Notes').fill('Lubed the stabs');

			await userEvent.keyboard('{Escape}');

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Discard your changes?' }))
				.toBeInTheDocument();
			await expect.element(dialog().getByLabelText('Notes')).toHaveValue('Lubed the stabs');
		});

		it('flags parts that are no longer in the collection', async () => {
			builds.updateBuild.mockRejectedValue(
				new ResponseError(
					new Response(JSON.stringify({ invalid_params: [{ name: 'switches[0].switch' }] }), {
						status: 400,
						headers: { 'Content-Type': 'application/problem+json' }
					})
				)
			);
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: STALE_REFS_MESSAGE }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('listitem').filter({ hasText: 'Ding Ding' }))
				.toHaveTextContent('No longer in your collection');
		});

		it('uploads a photo as WebP straight away and refreshes the build', async () => {
			const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			builds.createBuildImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/b' } as never);
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			const readsBefore = builds.getBuild.mock.calls.length;
			await userEvent.upload(
				page.elementLocator(document.querySelector('input[type="file"]')!),
				new File(['photo'], 'build.jpg', { type: 'image/jpeg' })
			);

			await vi.waitFor(() => expect(builds.getBuild.mock.calls.length).toBe(readsBefore + 1));
			expect(builds.createBuildImage).toHaveBeenCalledWith({
				userId: 'user-1',
				buildId: 'b-new',
				imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
			});
			expect(fetchMock).toHaveBeenCalledWith(
				'https://bucket.example/b',
				expect.objectContaining({
					method: 'PUT',
					headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*' }
				})
			);
		});

		it('says so when the save fails for another reason', async () => {
			builds.updateBuild.mockRejectedValue(new Error('network'));
			renderPage();
			await openCurrent();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not save your changes.' }))
				.toBeInTheDocument();
		});
	});

	describe('parts of a build', () => {
		it('opens the keyboard', async () => {
			renderPage();
			await openCurrent();

			await dialog()
				.getByRole('button', { name: /Neo65 Cu/ })
				.click();

			await expect
				.element(page.getByRole('dialog', { name: 'Neo65 Cu' }).last())
				.toBeInTheDocument();
			expect(keyboardsApi.getKeyboard).toHaveBeenLastCalledWith({
				userId: 'user-1',
				keyboardId: 'kb-1'
			});
		});

		it('opens a switch', async () => {
			vi.mocked(switchesApi.getSwitch).mockResolvedValue({
				id: 'sw-1',
				brand: 'Keygeek',
				name: 'Ding Ding',
				type: 'Linear'
			} as never);
			renderPage();
			await openCurrent();

			await dialog()
				.getByRole('button', { name: /Ding Ding/ })
				.click();

			await expect.element(page.getByRole('dialog', { name: /Ding Ding/ })).toBeInTheDocument();
			expect(switchesApi.getSwitch).toHaveBeenCalledWith({ userId: 'user-1', switchId: 'sw-1' });
		});

		it('opens a keycap kit', async () => {
			vi.mocked(keycapSetsApi.getKeycapSet).mockResolvedValue({
				id: 'set-1',
				brand: 'GMK',
				name: 'Fremen',
				kits: [{ kitId: 'base', name: 'Base' }]
			});
			renderPage();
			await openCurrent();

			await dialog()
				.getByRole('button', { name: /Fremen — Base/ })
				.click();

			await expect.element(page.getByRole('dialog', { name: 'Base' })).toBeInTheDocument();
		});

		it('says so when a kit has since been deleted', async () => {
			vi.mocked(keycapSetsApi.getKeycapSet).mockResolvedValue({
				id: 'set-1',
				brand: 'GMK',
				name: 'Fremen',
				kits: []
			});
			renderPage();
			await openCurrent();

			await dialog()
				.getByRole('button', { name: /Fremen — Base/ })
				.click();

			await expect.element(page.getByText('This kit no longer exists.')).toBeInTheDocument();
			await expect.element(page.getByRole('dialog', { name: 'Keycap kit' })).toBeInTheDocument();
		});
	});
});

import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus, ResponseError, type KeycapSet } from '@rogueserenity/kbdb-api-client';
import { buildsApi, keycapSetsApi } from '#lib/api/client.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import KeycapSetsPage from './+page.svelte';

vi.mock('#lib/image-resize.js', () => ({
	prepareImage: async (file: File) =>
		new File([file], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
}));

vi.mock('#lib/api/client.js', () => ({
	keycapSetsApi: {
		listKeycapSets: vi.fn(),
		getKeycapSet: vi.fn(),
		createKeycapSet: vi.fn(),
		updateKeycapSet: vi.fn(),
		deleteKeycapSet: vi.fn(),
		createKeycapKit: vi.fn(),
		updateKeycapKit: vi.fn(),
		deleteKeycapKit: vi.fn(),
		setKeycapKitImage: vi.fn(),
		deleteKeycapKitImage: vi.fn()
	},
	buildsApi: { getBuild: vi.fn() },
	lookupsApi: { getLookup: vi.fn(async () => ({ values: [] })) }
}));

const api = vi.mocked(keycapSetsApi);

const olivia: KeycapSet = {
	id: 'set-1',
	brand: 'GMK',
	name: 'Olivia',
	primaryKitId: 'base',
	kits: [
		{ kitId: 'base', name: 'Base' },
		{ kitId: 'novs', name: 'Novelties' },
		{ kitId: 'alphas', name: 'Alphas' }
	]
};

function conflict(blockingBuildIds?: string[]): ResponseError {
	return new ResponseError(
		new Response(JSON.stringify({ status: 409, blocking_build_ids: blockingBuildIds }), {
			status: 409,
			headers: { 'Content-Type': 'application/problem+json' }
		})
	);
}

async function renderPage(isOwnProfile = true) {
	await render(WithUserContext, { component: KeycapSetsPage, isOwnProfile });
}

const dialog = () => page.getByRole('dialog').last();

async function openOlivia() {
	await page.getByRole('button', { name: /Olivia/ }).click();
	await expect.element(dialog().getByText('Kits')).toBeInTheDocument();
}

async function openKit(name: string) {
	await dialog()
		.getByRole('button', { name: new RegExp(name) })
		.click();
	await expect.element(page.getByRole('heading', { name, level: 2 })).toBeInTheDocument();
}

beforeEach(() => {
	vi.clearAllMocks();
	api.listKeycapSets.mockResolvedValue({ items: [olivia] });
	api.getKeycapSet.mockResolvedValue(olivia);
});

describe('keycap sets page', () => {
	it('lists the sets and lets the owner add one', async () => {
		await renderPage();

		await expect.element(page.getByRole('button', { name: /Olivia/ })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add keycap set' })).toBeInTheDocument();
		expect(api.listKeycapSets).toHaveBeenCalledWith({ userId: 'user-1', cursor: undefined });
	});

	it('offers the owner cost and visibility sorts that visitors do not get', async () => {
		await renderPage();
		await expect
			.element(page.getByRole('option', { name: 'Sort: Total cost' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('option', { name: 'Sort: Visibility' }))
			.toBeInTheDocument();
	});

	describe('as a visitor', () => {
		it('hides adding, editing, deleting, and private sorts', async () => {
			await renderPage(false);
			await openOlivia();

			await expect
				.element(page.getByRole('button', { name: 'Add keycap set' }))
				.not.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Edit set' })).not.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Delete set' }))
				.not.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: '+ Add kit' })).not.toBeInTheDocument();
			await expect
				.element(page.getByRole('option', { name: 'Sort: Total cost' }))
				.not.toBeInTheDocument();
		});
	});

	it("lets visitors sort by each set's earliest kit order and delivery dates", async () => {
		const kit = (kitId: string, orderDate: string, deliveryDate?: string) => ({
			kitId,
			name: kitId,
			purchase: {
				orderDate: new Date(orderDate),
				deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined
			}
		});
		api.listKeycapSets.mockResolvedValue({
			items: [
				{ ...olivia, kits: [kit('base', '2024-03-01', '2025-01-01'), kit('novs', '2024-01-01')] },
				{
					id: 'set-2',
					brand: 'GMK',
					name: 'Botanical',
					kits: [kit('base', '2024-02-01', '2024-12-01'), kit('novs', '2024-02-15', '2025-03-01')]
				}
			]
		});
		await renderPage(false);
		const cards = () => page.getByRole('button', { name: /Olivia|Botanical/ });
		await expect.element(cards().first()).toHaveTextContent('Botanical');

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Order date');
		await expect.element(cards().first()).toHaveTextContent('Olivia');

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Delivery date');
		await expect.element(cards().first()).toHaveTextContent('Botanical');
	});

	describe('creating a set', () => {
		it('creates the set and opens it so kits can be added next', async () => {
			const created: KeycapSet = { id: 'set-2', brand: 'GMK', name: 'Botanical', kits: [] };
			api.createKeycapSet.mockResolvedValue(created);
			await renderPage();

			await page.getByRole('button', { name: 'Add keycap set' }).click();
			await dialog().getByLabelText('Brand').fill('GMK');
			await dialog().getByLabelText('Name').fill('Botanical');
			await dialog().getByRole('button', { name: 'Add keycap set' }).click();

			await expect.element(dialog().getByRole('button', { name: '+ Add kit' })).toBeInTheDocument();
			expect(api.createKeycapSet).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					keycapSetInput: expect.objectContaining({ brand: 'GMK', name: 'Botanical' })
				})
			);
			expect(api.listKeycapSets).toHaveBeenCalledTimes(2);
		});

		it('says so when the create fails', async () => {
			api.createKeycapSet.mockRejectedValue(new Error('network'));
			await renderPage();

			await page.getByRole('button', { name: 'Add keycap set' }).click();
			await dialog().getByLabelText('Brand').fill('GMK');
			await dialog().getByLabelText('Name').fill('Botanical');
			await dialog().getByRole('button', { name: 'Add keycap set' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not create this keycap set.' }))
				.toBeInTheDocument();
		});
	});

	describe('editing a set', () => {
		it('saves and returns to the updated set', async () => {
			api.updateKeycapSet.mockResolvedValue({ ...olivia, name: 'Olivia++' });
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: 'Edit set' }).click();
			await dialog().getByLabelText('Name').fill('Olivia++');
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect.element(dialog().getByRole('button', { name: 'Edit set' })).toBeInTheDocument();
			expect(api.updateKeycapSet).toHaveBeenCalledWith(
				expect.objectContaining({
					keycapSetId: 'set-1',
					keycapSetInput: expect.objectContaining({ name: 'Olivia++' })
				})
			);
		});

		it('says so when the save fails', async () => {
			api.updateKeycapSet.mockRejectedValue(new Error('network'));
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: 'Edit set' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not save your changes.' }))
				.toBeInTheDocument();
		});
	});

	it('asks before closing a set form with unsaved edits', async () => {
		await renderPage();
		await openOlivia();
		await page.getByRole('button', { name: 'Edit set' }).click();
		await dialog().getByLabelText('Name').fill('Olivia R2');

		await userEvent.keyboard('{Escape}');

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Discard your changes?' }))
			.toBeInTheDocument();
		await expect.element(dialog().getByLabelText('Name')).toHaveValue('Olivia R2');
	});

	describe('deleting a set', () => {
		it('asks first, then deletes and closes', async () => {
			api.deleteKeycapSet.mockResolvedValue(undefined);
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: 'Delete set' }).click();
			await expect.element(page.getByText('Delete "Olivia"?')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.deleteKeycapSet).toHaveBeenCalledWith({ userId: 'user-1', keycapSetId: 'set-1' });
		});

		it('names the builds that still use the set', async () => {
			api.deleteKeycapSet.mockRejectedValue(conflict(['b-1']));
			vi.mocked(buildsApi.getBuild).mockResolvedValue({
				id: 'b-1',
				keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' }
			} as never);
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: 'Delete set' }).click();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'Used in: Manta. Remove it from those builds first.' })
				)
				.toBeInTheDocument();
		});

		it('says the set is still used when kbdb names no builds', async () => {
			api.deleteKeycapSet.mockRejectedValue(conflict());
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: 'Delete set' }).click();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'This keycap set is still used by one or more builds.' })
				)
				.toBeInTheDocument();
		});

		it('reports any other failure', async () => {
			api.deleteKeycapSet.mockRejectedValue(new Error('network'));
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: 'Delete set' }).click();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not delete this keycap set.' }))
				.toBeInTheDocument();
		});
	});

	describe('kits', () => {
		it('asks before closing a kit form with unsaved edits', async () => {
			await renderPage();
			await openOlivia();
			await openKit('Base');
			await page.getByRole('button', { name: 'Edit kit' }).click();
			await dialog().getByLabelText('Name').fill('Base R2');

			await userEvent.keyboard('{Escape}');

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Discard your changes?' }))
				.toBeInTheDocument();
			await expect.element(dialog().getByLabelText('Name')).toHaveValue('Base R2');
		});

		it('steps through the kits with the arrows, wrapping at the ends', async () => {
			await renderPage();
			await openOlivia();
			await openKit('Base');

			await page.getByRole('button', { name: 'Next kit' }).click();
			await expect
				.element(page.getByRole('heading', { name: 'Novelties', level: 2 }))
				.toBeInTheDocument();
			await page.getByRole('button', { name: 'Previous kit' }).click();
			await page.getByRole('button', { name: 'Previous kit' }).click();
			await expect
				.element(page.getByRole('heading', { name: 'Alphas', level: 2 }))
				.toBeInTheDocument();
		});

		it('steps through the kits with the arrow keys', async () => {
			await renderPage();
			await openOlivia();
			await openKit('Base');

			await userEvent.keyboard('{ArrowRight}');
			await expect
				.element(page.getByRole('heading', { name: 'Novelties', level: 2 }))
				.toBeInTheDocument();
			await userEvent.keyboard('{ArrowLeft}');
			await expect
				.element(page.getByRole('heading', { name: 'Base', level: 2 }))
				.toBeInTheDocument();
		});

		it("names the full-size viewer's arrows for kits", async () => {
			const withPhotos: KeycapSet = {
				...olivia,
				kits: olivia.kits!.map((kit) => ({
					...kit,
					image: {
						url: `data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==#${kit.kitId}`
					}
				}))
			};
			api.listKeycapSets.mockResolvedValue({ items: [withPhotos] });
			await renderPage();
			await openOlivia();
			await openKit('Base');

			await dialog().getByRole('button', { name: 'View full size image' }).click();

			await expect.element(page.getByRole('button', { name: 'Next kit' })).toHaveLength(2);
			await expect
				.element(page.getByRole('button', { name: 'Next photo' }))
				.not.toBeInTheDocument();
		});

		async function addKitWithPhoto() {
			api.createKeycapKit.mockResolvedValue({ kitId: 'spacebars', name: 'Spacebars' });
			await renderPage();
			await openOlivia();
			await page.getByRole('button', { name: '+ Add kit' }).click();
			await dialog().getByLabelText('Name').fill('Spacebars');
			await userEvent.upload(
				page.elementLocator(
					document.querySelector('[role="dialog"]:last-of-type input[type="file"]')!
				),
				new File(['png'], 'kit.png', { type: 'image/png' })
			);
			await dialog().getByRole('button', { name: 'Add kit' }).click();
		}

		it('opens the new kit for editing when its photo upload fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response(null, { status: 403 }))
			);
			api.setKeycapKitImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/k' } as never);
			api.getKeycapSet.mockResolvedValue({
				...olivia,
				kits: [...olivia.kits!, { kitId: 'spacebars', name: 'Spacebars' }]
			});

			await addKitWithPhoto();

			await expect.element(dialog().getByRole('heading', { name: 'Edit kit' })).toBeInTheDocument();
			await expect
				.element(
					dialog()
						.getByRole('alert')
						.filter({ hasText: "The kit was added, but its photo wasn't. Add it again." })
				)
				.toBeInTheDocument();
			vi.unstubAllGlobals();
		});

		it("closes the kit with a notice when its photo fails and the set can't be reloaded", async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response(null, { status: 403 }))
			);
			api.setKeycapKitImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/k' } as never);
			api.getKeycapSet.mockRejectedValue(new Error('network'));

			await addKitWithPhoto();

			await expect.element(page.getByRole('heading', { name: 'Edit kit' })).not.toBeInTheDocument();
			await expect
				.element(
					dialog().getByRole('alert').filter({
						hasText: "The kit was added, but its photo wasn't. Add it again by editing the kit."
					})
				)
				.toBeInTheDocument();
			vi.unstubAllGlobals();
		});

		it('closes the kit and says so in the set when uploads are unavailable', async () => {
			api.setKeycapKitImage.mockRejectedValue(
				new ResponseError(new Response(null, { status: 429 }))
			);

			await addKitWithPhoto();

			await expect.element(page.getByRole('heading', { name: 'Edit kit' })).not.toBeInTheDocument();
			await expect
				.element(
					dialog().getByRole('alert').filter({
						hasText:
							"The kit was added, but its photo wasn't. Uploads unavailable, try again later."
					})
				)
				.toBeInTheDocument();
		});

		it('clears the kit notice once another kit is opened', async () => {
			api.setKeycapKitImage.mockRejectedValue(
				new ResponseError(new Response(null, { status: 429 }))
			);
			await addKitWithPhoto();
			const notice = dialog().getByRole('alert').filter({ hasText: 'Uploads unavailable' });
			await expect.element(notice).toBeInTheDocument();

			await openKit('Novelties');
			await page.getByRole('button', { name: 'Close' }).last().click();

			await expect.element(notice).not.toBeInTheDocument();
		});

		it('adds a kit with a staged photo and uploads it', async () => {
			const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			api.createKeycapKit.mockResolvedValue({ kitId: 'spacebars', name: 'Spacebars' });
			api.setKeycapKitImage.mockResolvedValue({
				uploadUrl: 'https://bucket.example/signed'
			} as never);
			await renderPage();
			await openOlivia();

			await page.getByRole('button', { name: '+ Add kit' }).click();
			await dialog().getByLabelText('Name').fill('Spacebars');
			await userEvent.upload(
				page.elementLocator(
					document.querySelector('[role="dialog"]:last-of-type input[type="file"]')!
				),
				new File(['png'], 'kit.png', { type: 'image/png' })
			);
			await dialog().getByRole('button', { name: 'Add kit' }).click();

			await vi.waitFor(() =>
				expect(fetchMock).toHaveBeenCalledWith(
					'https://bucket.example/signed',
					expect.objectContaining({ method: 'PUT' })
				)
			);
			expect(api.setKeycapKitImage).toHaveBeenCalledWith(
				expect.objectContaining({
					keycapSetId: 'set-1',
					kitId: 'spacebars',
					imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
				})
			);
			vi.unstubAllGlobals();
		});

		it('names the builds that still use a kit', async () => {
			api.deleteKeycapKit.mockRejectedValue(conflict(['b-1']));
			vi.mocked(buildsApi.getBuild).mockResolvedValue({
				id: 'b-1',
				keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' }
			} as never);
			await renderPage();
			await openOlivia();
			await openKit('Novelties');

			await page.getByRole('button', { name: 'Delete kit' }).click();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'Used in: Manta. Remove it from those builds first.' })
				)
				.toBeInTheDocument();
			expect(api.deleteKeycapKit).toHaveBeenCalledWith({
				userId: 'user-1',
				keycapSetId: 'set-1',
				kitId: 'novs'
			});
		});

		it('deletes a kit and refreshes the set', async () => {
			api.deleteKeycapKit.mockResolvedValue(undefined);
			api.getKeycapSet.mockResolvedValue({
				...olivia,
				kits: olivia.kits!.filter((kit) => kit.kitId !== 'novs')
			});
			await renderPage();
			await openOlivia();
			await openKit('Novelties');

			await page.getByRole('button', { name: 'Delete kit' }).click();
			await page.getByRole('button', { name: 'Confirm delete' }).click();

			await expect
				.element(dialog().getByRole('button', { name: /Novelties/ }))
				.not.toBeInTheDocument();
			await expect.element(dialog().getByRole('button', { name: /Alphas/ })).toBeInTheDocument();
		});
	});

	it('titles the tab', async () => {
		await renderPage();

		await vi.waitFor(() => expect(document.title).toBe('Keycap sets · @rogue.serenity · mykeebs'));
	});
});

describe('keycap sets page image moderation', () => {
	it('re-fetches a set with a pending kit photo when it is opened', async () => {
		const withKitImage = (image: NonNullable<KeycapSet['kits']>[number]['image']) => ({
			...olivia,
			kits: [{ ...olivia.kits![0], image }, ...olivia.kits!.slice(1)]
		});
		api.listKeycapSets.mockResolvedValue({
			items: [
				withKitImage({
					url: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
					status: ImageStatus.Pending
				})
			]
		});
		api.getKeycapSet.mockResolvedValue(
			withKitImage({ status: ImageStatus.Rejected, rejectionReason: 'Explicit' })
		);
		await renderPage();
		await openOlivia();

		await expect
			.element(dialog().getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
			.toBeInTheDocument();
		expect(api.getKeycapSet).toHaveBeenCalledTimes(1);
	});
});

import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ImageStatus,
	ResponseError,
	Visibility,
	type Keyboard
} from '@rogueserenity/kbdb-api-client';
import { buildsApi, keyboardsApi, lookupsApi } from '#lib/api/client.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import KeyboardsPage from './+page.svelte';

vi.mock('#lib/image-resize.js', () => ({
	prepareImage: async (file: File) => {
		// The first photo finishes converting last, so out-of-order uploads would show.
		if (file.name === 'a.png') await new Promise((resolve) => setTimeout(resolve, 50));
		return new File([file], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
	}
}));

vi.mock('#lib/api/client.js', () => ({
	keyboardsApi: {
		listKeyboards: vi.fn(),
		getKeyboard: vi.fn(),
		createKeyboard: vi.fn(),
		updateKeyboard: vi.fn(),
		deleteKeyboard: vi.fn(),
		createKeyboardImage: vi.fn(),
		deleteKeyboardImage: vi.fn(),
		createKeyboardPlate: vi.fn(),
		updateKeyboardPlate: vi.fn(),
		deleteKeyboardPlate: vi.fn(),
		createKeyboardPCB: vi.fn(),
		updateKeyboardPCB: vi.fn(),
		deleteKeyboardPCB: vi.fn()
	},
	buildsApi: { getBuild: vi.fn() },
	lookupsApi: { getLookup: vi.fn(async () => ({ values: [] })) }
}));

const api = vi.mocked(keyboardsApi);

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const manta: Keyboard = {
	id: 'kb-1',
	brand: 'Bowl',
	name: 'Manta',
	size: '65%',
	layout: 'WK',
	visibility: Visibility.Public,
	images: [
		{ imageId: 'img-1', url: `${PIXEL}#1` },
		{ imageId: 'img-2', url: `${PIXEL}#2` }
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
	await render(WithUserContext, { component: KeyboardsPage, isOwnProfile });
}

const dialog = () => page.getByRole('dialog').last();

async function openManta() {
	await page.getByRole('button', { name: /Manta/ }).click();
	await expect.element(page.getByRole('dialog', { name: 'Manta' })).toBeInTheDocument();
}

function plateMaterials(values: string[]) {
	vi.mocked(lookupsApi.getLookup).mockImplementation(
		async ({ category }) =>
			({ category, values: category === 'keyboard_plate_material' ? values : [] }) as never
	);
}

async function addPlate(material: string) {
	await dialog()
		.getByText(/^Plates —/)
		.click();
	await dialog().getByRole('button', { name: '+ Add plate' }).click();
	await dialog()
		.getByRole('group', { name: 'Plate 1' })
		.getByLabelText('Material', { exact: false })
		.selectOptions(material);
}

async function fillNewKeyboard() {
	await page.getByRole('button', { name: 'Add keyboard' }).click();
	await dialog().getByLabelText('Brand', { exact: false }).fill('Bowl');
	await dialog().getByLabelText('Name', { exact: false }).fill('Deacon TKL');
}

beforeEach(() => {
	vi.clearAllMocks();
	api.listKeyboards.mockResolvedValue({ items: [manta] });
	api.getKeyboard.mockResolvedValue(manta);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('keyboards page', () => {
	it('lists the keyboards and lets the owner add one', async () => {
		await renderPage();

		await expect
			.element(page.getByRole('button', { name: /Manta/ }))
			.toMatchTextContent('65% · WK');
		await expect.element(page.getByRole('button', { name: 'Add keyboard' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('option', { name: 'Sort: Total cost' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('option', { name: 'Sort: Visibility' }))
			.toBeInTheDocument();
	});

	it("shows each keyboard's total cost, parts included, rather than its base price", async () => {
		api.listKeyboards.mockResolvedValue({
			items: [
				{
					...manta,
					purchase: { price: 300, currency: 'USD' },
					totalCost: 420,
					currency: 'USD'
				}
			]
		});
		await renderPage();

		await expect.element(page.getByRole('button', { name: /Manta/ })).toMatchTextContent('$420.00');
		await expect
			.element(page.getByRole('button', { name: /Manta/ }))
			.not.toHaveTextContent('$300.00');
	});

	it('hides adding, editing, deleting, and private sorts from visitors', async () => {
		await renderPage(false);
		await openManta();

		await expect
			.element(page.getByRole('button', { name: 'Add keyboard' }))
			.not.toBeInTheDocument();
		await expect.element(dialog().getByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		await expect.element(dialog().getByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('option', { name: 'Sort: Total cost' }))
			.not.toBeInTheDocument();
	});

	it('lets visitors sort by order and delivery dates', async () => {
		api.listKeyboards.mockResolvedValue({
			items: [
				{
					...manta,
					purchase: { orderDate: new Date('2024-05-01'), deliveryDate: new Date('2024-06-01') }
				},
				{
					...manta,
					id: 'kb-2',
					name: 'Zoom65',
					purchase: { orderDate: new Date('2024-02-01'), deliveryDate: new Date('2024-09-01') }
				}
			]
		});
		await renderPage(false);
		const cards = () => page.getByRole('button', { name: /Manta|Zoom65/ });
		await expect.element(cards().first()).toMatchTextContent('Manta');

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Order date');
		await expect.element(cards().first()).toMatchTextContent('Zoom65');

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Delivery date');
		await expect.element(cards().first()).toMatchTextContent('Manta');
	});

	it("steps through a keyboard's photos full size, wrapping at the ends", async () => {
		await renderPage();
		await openManta();

		const shown = () => document.querySelector('img.select-none')?.getAttribute('src');

		await dialog()
			.getByRole('button', { name: 'View full size image', exact: false })
			.nth(1)
			.click();
		await vi.waitFor(() => expect(shown()).toBe(`${PIXEL}#2`));

		await page.getByRole('button', { name: 'Next photo' }).click();
		await vi.waitFor(() => expect(shown()).toBe(`${PIXEL}#1`));

		await page.getByRole('button', { name: 'Previous photo' }).click();
		await vi.waitFor(() => expect(shown()).toBe(`${PIXEL}#2`));
	});

	describe('image moderation', () => {
		const rejected = {
			imageId: 'img-r',
			status: ImageStatus.Rejected,
			rejectionReason: 'Explicit'
		};

		it('leaves a rejected photo out of the full-size gallery', async () => {
			const withRejected = { ...manta, images: [manta.images![0], rejected, manta.images![1]] };
			api.listKeyboards.mockResolvedValue({ items: [withRejected] });
			await renderPage();
			await openManta();

			const shown = () => document.querySelector('img.select-none')?.getAttribute('src');
			await expect
				.element(dialog().getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
				.toBeInTheDocument();

			await dialog()
				.getByRole('button', { name: 'View full size image', exact: false })
				.nth(1)
				.click();
			await vi.waitFor(() => expect(shown()).toBe(`${PIXEL}#2`));
			await page.getByRole('button', { name: 'Next photo' }).click();
			await vi.waitFor(() => expect(shown()).toBe(`${PIXEL}#1`));
		});

		it('re-fetches a keyboard with a pending photo when it is opened', async () => {
			const pending = {
				...manta,
				images: [{ imageId: 'img-1', url: `${PIXEL}#1`, status: ImageStatus.Pending }]
			};
			api.listKeyboards.mockResolvedValue({ items: [pending] });
			api.getKeyboard.mockResolvedValue({
				...manta,
				images: [{ imageId: 'img-1', status: ImageStatus.Rejected, rejectionReason: 'Explicit' }]
			});
			await renderPage();
			await openManta();

			await expect
				.element(dialog().getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
				.toBeInTheDocument();
			expect(api.getKeyboard).toHaveBeenCalledTimes(1);
		});

		it("doesn't re-fetch a keyboard with no pending photo", async () => {
			await renderPage();
			await openManta();

			await expect.element(dialog().getByRole('button', { name: 'Edit' })).toBeInTheDocument();
			expect(api.getKeyboard).not.toHaveBeenCalled();
		});

		it('says uploads are unavailable when kbdb refuses with a 429', async () => {
			api.createKeyboardImage.mockRejectedValue(
				new ResponseError(
					new Response(null, {
						status: 429,
						headers: { 'Content-Type': 'application/problem+json' }
					})
				)
			);
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await userEvent.upload(
				page.elementLocator(document.querySelector('input[type="file"]')!),
				new File(['c'], 'c.png', { type: 'image/png' })
			);

			await expect
				.element(
					dialog().getByRole('alert').filter({ hasText: 'Uploads unavailable, try again later.' })
				)
				.toBeInTheDocument();
		});
	});

	describe('adding a keyboard', () => {
		it('creates it, uploads the staged photos as WebP in order, and closes', async () => {
			const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			api.createKeyboard.mockResolvedValue({ id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' });
			api.createKeyboardImage
				.mockResolvedValueOnce({ uploadUrl: 'https://bucket.example/a' } as never)
				.mockResolvedValueOnce({ uploadUrl: 'https://bucket.example/b' } as never);
			await renderPage();

			await fillNewKeyboard();
			await userEvent.upload(page.elementLocator(document.querySelector('input[type="file"]')!), [
				new File(['a'], 'a.png', { type: 'image/png' }),
				new File(['b'], 'b.png', { type: 'image/png' })
			]);
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.createKeyboard).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					keyboardInput: expect.objectContaining({ brand: 'Bowl', name: 'Deacon TKL' })
				})
			);
			expect(api.createKeyboardImage).toHaveBeenCalledTimes(2);
			expect(api.createKeyboardImage).toHaveBeenCalledWith(
				expect.objectContaining({
					imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
				})
			);
			expect(fetchMock.mock.calls.map(([url, init]) => [url, (init?.body as File).name])).toEqual([
				['https://bucket.example/a', 'a.webp'],
				['https://bucket.example/b', 'b.webp']
			]);
			expect(api.listKeyboards).toHaveBeenCalledTimes(2);
		});

		it('opens the new keyboard for editing when a photo upload fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response(null, { status: 403 }))
			);
			api.createKeyboard.mockResolvedValue({ id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' });
			api.createKeyboardImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/a' } as never);
			await renderPage();

			await fillNewKeyboard();
			await userEvent.upload(
				page.elementLocator(document.querySelector('input[type="file"]')!),
				new File(['a'], 'a.png', { type: 'image/png' })
			);
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect
				.element(dialog().getByRole('heading', { name: 'Edit keyboard' }))
				.toBeInTheDocument();
			await expect
				.element(
					dialog()
						.getByRole('alert')
						.filter({ hasText: "The keyboard was added, but its photo wasn't. Add it again." })
				)
				.toBeInTheDocument();
		});

		it('closes and says so when uploads are unavailable, without trying the rest', async () => {
			api.createKeyboard.mockResolvedValue({ id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' });
			api.createKeyboardImage.mockRejectedValue(
				new ResponseError(
					new Response(null, {
						status: 429,
						headers: { 'Content-Type': 'application/problem+json' }
					})
				)
			);
			await renderPage();

			await fillNewKeyboard();
			await userEvent.upload(page.elementLocator(document.querySelector('input[type="file"]')!), [
				new File(['a'], 'a.png', { type: 'image/png' }),
				new File(['b'], 'b.png', { type: 'image/png' })
			]);
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect
				.element(
					page.getByRole('alert').filter({
						hasText:
							"The keyboard was added, but its photos weren't. Uploads unavailable, try again later."
					})
				)
				.toBeInTheDocument();
			expect(api.createKeyboardImage).toHaveBeenCalledTimes(1);

			await page.getByRole('button', { name: 'Dismiss' }).click();
			await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		});

		it('adds its plates and PCBs once the keyboard exists', async () => {
			plateMaterials(['POM']);
			api.createKeyboard.mockResolvedValue({ id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' });
			api.createKeyboardPlate.mockResolvedValue({ id: 'p1', material: 'POM' });
			await renderPage();

			await fillNewKeyboard();
			await addPlate('POM');
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.createKeyboardPlate).toHaveBeenCalledWith({
				userId: 'user-1',
				keyboardId: 'kb-2',
				keyboardPlateInput: { material: 'POM' }
			});
			expect(api.createKeyboard.mock.invocationCallOrder[0]).toBeLessThan(
				api.createKeyboardPlate.mock.invocationCallOrder[0]
			);
		});

		it('opens the new keyboard for editing when a part fails to save', async () => {
			plateMaterials(['POM']);
			const created = { id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' };
			api.createKeyboard.mockResolvedValue(created);
			api.createKeyboardPlate.mockRejectedValue(new Error('network'));
			api.getKeyboard.mockResolvedValue(created);
			await renderPage();

			await fillNewKeyboard();
			await addPlate('POM');
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect
				.element(dialog().getByRole('heading', { name: 'Edit keyboard' }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('alert').filter({ hasText: "some of its plates or PCBs weren't" }))
				.toBeInTheDocument();
			await expect
				.element(dialog().getByLabelText('Name', { exact: false }))
				.toHaveValue('Deacon TKL');
		});

		it('says once that the keyboard was added when both a part and a photo fail', async () => {
			plateMaterials(['POM']);
			const created = { id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' };
			api.createKeyboard.mockResolvedValue(created);
			api.createKeyboardPlate.mockRejectedValue(new Error('network'));
			api.createKeyboardImage.mockRejectedValue(
				new ResponseError(
					new Response(null, {
						status: 429,
						headers: { 'Content-Type': 'application/problem+json' }
					})
				)
			);
			api.getKeyboard.mockResolvedValue(created);
			await renderPage();

			await fillNewKeyboard();
			await addPlate('POM');
			await userEvent.upload(
				page.elementLocator(document.querySelector('input[type="file"]')!),
				new File(['a'], 'a.png', { type: 'image/png' })
			);
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect
				.element(
					dialog().getByRole('alert').filter({
						hasText:
							"The keyboard was added, but some of its plates or PCBs weren't. Add them again and save. Its photo wasn't added either. Uploads unavailable, try again later."
					})
				)
				.toBeInTheDocument();
		});

		it("doesn't call a created keyboard a failed create when reloading it fails", async () => {
			plateMaterials(['POM']);
			api.createKeyboard.mockResolvedValue({ id: 'kb-2', brand: 'Bowl', name: 'Deacon TKL' });
			api.createKeyboardPlate.mockRejectedValue(new Error('network'));
			api.getKeyboard.mockRejectedValue(new Error('network'));
			await renderPage();

			await fillNewKeyboard();
			await addPlate('POM');
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect
				.element(dialog().getByRole('heading', { name: 'Edit keyboard' }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not create this keyboard.' }))
				.not.toBeInTheDocument();
			expect(api.createKeyboard).toHaveBeenCalledOnce();
		});

		it('says so when the create fails', async () => {
			api.createKeyboard.mockRejectedValue(new Error('network'));
			await renderPage();

			await fillNewKeyboard();
			await dialog().getByRole('button', { name: 'Add keyboard' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not create this keyboard.' }))
				.toBeInTheDocument();
		});
	});

	describe('editing a keyboard', () => {
		it('saves and returns to the updated keyboard', async () => {
			api.updateKeyboard.mockResolvedValue({ ...manta, name: 'Manta R2' });
			api.getKeyboard.mockResolvedValue({ ...manta, name: 'Manta R2' });
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByLabelText('Name', { exact: false }).fill('Manta R2');
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect.element(page.getByRole('dialog', { name: 'Manta R2' })).toBeInTheDocument();
			expect(api.updateKeyboard).toHaveBeenCalledWith(
				expect.objectContaining({
					keyboardId: 'kb-1',
					keyboardInput: expect.objectContaining({ name: 'Manta R2' })
				})
			);
		});

		it('saves changed parts by id and leaves the rest alone', async () => {
			const withParts: Keyboard = {
				...manta,
				plates: [
					{ id: 'p1', material: 'POM' },
					{ id: 'p2', material: 'PC' }
				],
				pcbs: [{ id: 'c1', assembly: 'Hotswap', connectivity: 'Wired' }]
			};
			api.listKeyboards.mockResolvedValue({ items: [withParts] });
			api.updateKeyboard.mockResolvedValue(withParts);
			api.getKeyboard.mockResolvedValue(withParts);
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('group', { name: 'Plate 2' }).getByLabelText('Color').fill('Clear');
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(dialog().getByRole('heading', { name: 'Edit keyboard' }))
				.not.toBeInTheDocument();
			expect(api.updateKeyboardPlate).toHaveBeenCalledExactlyOnceWith({
				userId: 'user-1',
				keyboardId: 'kb-1',
				plateId: 'p2',
				keyboardPlateInput: { material: 'PC', color: 'Clear' }
			});
			expect(api.deleteKeyboardPlate).not.toHaveBeenCalled();
			expect(api.updateKeyboardPCB).not.toHaveBeenCalled();
		});

		it('names the builds that keep a part from being removed, and saves nothing else', async () => {
			const withPlate: Keyboard = { ...manta, plates: [{ id: 'p1', material: 'POM' }] };
			api.listKeyboards.mockResolvedValue({ items: [withPlate] });
			api.deleteKeyboardPlate.mockRejectedValue(conflict(['b1']));
			vi.mocked(buildsApi.getBuild).mockResolvedValue({
				id: 'b1',
				keyboard: { id: 'kb-1', brand: 'Bowl', name: 'Manta' },
				buildDate: new Date('2026-08-03')
			});
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByLabelText('Name', { exact: false }).fill('Manta R2');
			await dialog().getByRole('button', { name: 'Remove plate 1' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: "Can't remove the POM plate: it's used by Manta (Aug 3, 2026)." })
				)
				.toBeInTheDocument();
			expect(api.updateKeyboard).not.toHaveBeenCalled();
			await vi.waitFor(() =>
				expect(api.getKeyboard).toHaveBeenCalledWith({ userId: 'user-1', keyboardId: 'kb-1' })
			);
			await expect
				.element(dialog().getByLabelText('Name', { exact: false }))
				.toHaveValue('Manta R2');
		});

		it('picks up a removal that went through, so saving again does not repeat it', async () => {
			const withPlates: Keyboard = {
				...manta,
				plates: [
					{ id: 'p1', material: 'POM' },
					{ id: 'p2', material: 'PC' }
				]
			};
			api.listKeyboards.mockResolvedValue({ items: [withPlates] });
			api.deleteKeyboardPlate.mockResolvedValue(null);
			api.updateKeyboard.mockRejectedValueOnce(new Error('network')).mockResolvedValue(manta);
			api.getKeyboard.mockResolvedValue({ ...manta, plates: [{ id: 'p2', material: 'PC' }] });
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Remove plate 1' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();
			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not save your changes.' }))
				.toBeInTheDocument();
			await vi.waitFor(() => expect(api.getKeyboard).toHaveBeenCalled());
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(dialog().getByRole('heading', { name: 'Edit keyboard' }))
				.not.toBeInTheDocument();
			expect(api.deleteKeyboardPlate).toHaveBeenCalledOnce();
			expect(api.updateKeyboardPlate).not.toHaveBeenCalled();
		});

		it('says so when the save fails', async () => {
			api.updateKeyboard.mockRejectedValue(new Error('network'));
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not save your changes.' }))
				.toBeInTheDocument();
		});

		it('removes a photo and refreshes the keyboard', async () => {
			api.deleteKeyboardImage.mockResolvedValue(undefined);
			api.getKeyboard.mockResolvedValue({ ...manta, images: [manta.images![0]] });
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Remove image 2 of 2' }).click();

			await expect
				.element(dialog().getByRole('button', { name: 'Remove image 1 of 1' }))
				.toBeInTheDocument();
			expect(api.deleteKeyboardImage).toHaveBeenCalledWith({
				userId: 'user-1',
				keyboardId: 'kb-1',
				imageId: 'img-2'
			});
		});

		it('uploads a photo straight away and refreshes the keyboard', async () => {
			const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			api.createKeyboardImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/c' } as never);
			await renderPage();
			await openManta();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await userEvent.upload(
				page.elementLocator(document.querySelector('input[type="file"]')!),
				new File(['c'], 'c.png', { type: 'image/png' })
			);

			await vi.waitFor(() =>
				expect(api.getKeyboard).toHaveBeenCalledWith({ userId: 'user-1', keyboardId: 'kb-1' })
			);
			expect(api.createKeyboardImage).toHaveBeenCalledWith(
				expect.objectContaining({
					imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
				})
			);
			expect(fetchMock).toHaveBeenCalledWith(
				'https://bucket.example/c',
				expect.objectContaining({
					method: 'PUT',
					headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*' }
				})
			);
		});
	});

	describe('unsaved changes', () => {
		const discardPrompt = () =>
			page.getByRole('alert').filter({ hasText: 'Discard your changes?' });

		it('asks before closing a form with edits, and keeps it open on "Keep editing"', async () => {
			await renderPage();
			await fillNewKeyboard();

			await userEvent.keyboard('{Escape}');
			await expect.element(discardPrompt()).toBeInTheDocument();

			await page.getByRole('button', { name: 'Keep editing' }).click();
			await expect.element(discardPrompt()).not.toBeInTheDocument();
			await expect
				.element(dialog().getByLabelText('Name', { exact: false }))
				.toHaveValue('Deacon TKL');

			await userEvent.keyboard('{Escape}');
			await page.getByRole('button', { name: 'Discard' }).click();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('closes an untouched form straight away', async () => {
			await renderPage();
			await page.getByRole('button', { name: 'Add keyboard' }).click();
			await expect.element(dialog().getByLabelText('Name', { exact: false })).toBeInTheDocument();

			await userEvent.keyboard('{Escape}');

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('stops asking once an edit is cancelled', async () => {
			await renderPage();
			await openManta();
			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByLabelText('Name', { exact: false }).fill('Manta R2');

			await dialog().getByRole('button', { name: 'Cancel' }).click();
			await expect.element(page.getByRole('dialog', { name: 'Manta' })).toBeInTheDocument();
			await userEvent.keyboard('{Escape}');

			await expect.element(discardPrompt()).not.toBeInTheDocument();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('stops asking once an edit is saved', async () => {
			api.updateKeyboard.mockResolvedValue({ ...manta, name: 'Manta R2' });
			api.getKeyboard.mockResolvedValue({ ...manta, name: 'Manta R2' });
			await renderPage();
			await openManta();
			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByLabelText('Name', { exact: false }).fill('Manta R2');

			await dialog().getByRole('button', { name: 'Save changes' }).click();
			await expect.element(page.getByRole('dialog', { name: 'Manta R2' })).toBeInTheDocument();
			await userEvent.keyboard('{Escape}');

			await expect.element(discardPrompt()).not.toBeInTheDocument();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('deleting a keyboard', () => {
		async function confirmDelete() {
			await dialog().getByRole('button', { name: 'Delete' }).click();
			await expect.element(page.getByText('Delete "Manta"?')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Confirm delete' }).click();
		}

		it('asks first, then deletes and closes', async () => {
			api.deleteKeyboard.mockResolvedValue(undefined);
			await renderPage();
			await openManta();

			await confirmDelete();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.deleteKeyboard).toHaveBeenCalledWith({ userId: 'user-1', keyboardId: 'kb-1' });
		});

		it('names the builds that still use it', async () => {
			api.deleteKeyboard.mockRejectedValue(conflict(['b-1']));
			vi.mocked(buildsApi.getBuild).mockResolvedValue({
				id: 'b-1',
				buildDate: new Date('2026-09-10T12:00:00Z'),
				keyboard: { id: 'kb-1', brand: 'Bowl', name: 'Manta' }
			} as never);
			await renderPage();
			await openManta();

			await confirmDelete();

			await expect
				.element(
					page.getByRole('alert').filter({
						hasText: 'Used in: Manta (Sep 10, 2026). Remove it from those builds first.'
					})
				)
				.toBeInTheDocument();
		});

		it('says it is still used when kbdb names no builds', async () => {
			api.deleteKeyboard.mockRejectedValue(conflict());
			await renderPage();
			await openManta();

			await confirmDelete();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'This keyboard is still used by one or more builds.' })
				)
				.toBeInTheDocument();
		});

		it('reports any other failure', async () => {
			api.deleteKeyboard.mockRejectedValue(new Error('network'));
			await renderPage();
			await openManta();

			await confirmDelete();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not delete this keyboard.' }))
				.toBeInTheDocument();
		});
	});
});

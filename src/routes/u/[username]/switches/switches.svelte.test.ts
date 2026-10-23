import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ImageStatus,
	ResponseError,
	Visibility,
	type Switch
} from '@rogueserenity/kbdb-api-client';
import { buildsApi, switchesApi } from '#lib/api/client.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import SwitchesPage from './+page.svelte';

vi.mock('#lib/image-resize.js', () => ({
	prepareImage: async (file: File) =>
		new File([file], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
}));

vi.mock('#lib/api/client.js', () => ({
	switchesApi: {
		listSwitches: vi.fn(),
		getSwitch: vi.fn(),
		createSwitch: vi.fn(),
		updateSwitch: vi.fn(),
		deleteSwitch: vi.fn(),
		setSwitchImage: vi.fn(),
		deleteSwitchImage: vi.fn()
	},
	buildsApi: { getBuild: vi.fn() },
	lookupsApi: {
		getLookup: vi.fn(async ({ category }: { category: string }) => ({
			values: category === 'switch_type' ? ['Linear', 'Tactile'] : []
		}))
	}
}));

const api = vi.mocked(switchesApi);

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const aperol: Switch = {
	id: 'sw-1',
	brand: 'HMX',
	name: 'Aperol',
	type: 'Linear',
	visibility: Visibility.Public,
	image: { url: PIXEL }
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
	await render(WithUserContext, { component: SwitchesPage, isOwnProfile });
}

const dialog = () => page.getByRole('dialog').last();
const fileInput = () => page.elementLocator(document.querySelector('input[type="file"]')!);
const png = (name: string) => new File([name], name, { type: 'image/png' });

async function openAperol() {
	await page.getByRole('button', { name: /Aperol/ }).click();
	await expect.element(page.getByRole('dialog', { name: 'Aperol' })).toBeInTheDocument();
}

async function fillNewSwitch() {
	await page.getByRole('button', { name: 'Add switch' }).click();
	await dialog().getByLabelText('Brand').fill('Gateron');
	await dialog().getByLabelText('Name').fill('Oil King');
	await dialog().getByLabelText('Type').selectOptions('Linear');
}

beforeEach(() => {
	vi.clearAllMocks();
	api.listSwitches.mockResolvedValue({ items: [aperol] });
	api.getSwitch.mockResolvedValue(aperol);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('switches page', () => {
	it('lists the switches and lets the owner add one', async () => {
		await renderPage();

		await expect.element(page.getByRole('button', { name: /Aperol/ })).toHaveTextContent('Linear');
		await expect.element(page.getByRole('button', { name: 'Add switch' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Sort: Price' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('option', { name: 'Sort: Visibility' }))
			.toBeInTheDocument();
	});

	it('hides adding, editing, deleting, and private sorts from visitors', async () => {
		await renderPage(false);
		await openAperol();

		await expect.element(page.getByRole('button', { name: 'Add switch' })).not.toBeInTheDocument();
		await expect.element(dialog().getByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		await expect.element(dialog().getByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Sort: Price' })).not.toBeInTheDocument();
	});

	it('lets visitors sort by order and delivery dates', async () => {
		api.listSwitches.mockResolvedValue({
			items: [
				{
					...aperol,
					purchase: { orderDate: new Date('2024-05-01'), deliveryDate: new Date('2024-06-01') }
				},
				{
					...aperol,
					id: 'sw-2',
					name: 'Banana',
					purchase: { orderDate: new Date('2024-02-01'), deliveryDate: new Date('2024-09-01') }
				}
			]
		});
		await renderPage(false);
		const cards = () => page.getByRole('button', { name: /Aperol|Banana/ });
		await expect.element(cards().first()).toHaveTextContent('Aperol');

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Order date');
		await expect.element(cards().first()).toHaveTextContent('Banana');

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Sort: Delivery date');
		await expect.element(cards().first()).toHaveTextContent('Aperol');
	});

	it('opens the photo full size', async () => {
		await renderPage();
		await openAperol();

		await dialog().getByRole('button', { name: 'View full size image' }).click();

		await vi.waitFor(() =>
			expect(document.querySelector('img.select-none')?.getAttribute('src')).toBe(PIXEL)
		);
	});

	describe('adding a switch', () => {
		it('creates it, uploads the staged photo, and closes', async () => {
			const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			api.createSwitch.mockResolvedValue({
				id: 'sw-2',
				brand: 'Gateron',
				name: 'Oil King'
			} as never);
			api.setSwitchImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/s' } as never);
			await renderPage();

			await fillNewSwitch();
			await userEvent.upload(fileInput(), png('oil-king.png'));
			await dialog().getByRole('button', { name: 'Add switch' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.createSwitch).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					switchInput: expect.objectContaining({
						brand: 'Gateron',
						name: 'Oil King',
						type: 'Linear'
					})
				})
			);
			expect(api.setSwitchImage).toHaveBeenCalledWith(
				expect.objectContaining({
					switchId: 'sw-2',
					imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
				})
			);
			expect(fetchMock).toHaveBeenCalledWith(
				'https://bucket.example/s',
				expect.objectContaining({ method: 'PUT' })
			);
			expect(api.listSwitches).toHaveBeenCalledTimes(2);
		});

		it('opens the new switch for editing when the photo upload fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response(null, { status: 403 }))
			);
			api.createSwitch.mockResolvedValue({
				id: 'sw-2',
				brand: 'Gateron',
				name: 'Oil King'
			} as never);
			api.setSwitchImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/s' } as never);
			await renderPage();

			await fillNewSwitch();
			await userEvent.upload(fileInput(), png('oil-king.png'));
			await dialog().getByRole('button', { name: 'Add switch' }).click();

			await expect
				.element(dialog().getByRole('heading', { name: 'Edit switch' }))
				.toBeInTheDocument();
			await expect
				.element(
					dialog()
						.getByRole('alert')
						.filter({ hasText: "The switch was added, but its photo wasn't. Add it again." })
				)
				.toBeInTheDocument();
		});

		it('closes and says so when uploads are unavailable', async () => {
			api.createSwitch.mockResolvedValue({
				id: 'sw-2',
				brand: 'Gateron',
				name: 'Oil King'
			} as never);
			api.setSwitchImage.mockRejectedValue(new ResponseError(new Response(null, { status: 429 })));
			await renderPage();

			await fillNewSwitch();
			await userEvent.upload(fileInput(), png('oil-king.png'));
			await dialog().getByRole('button', { name: 'Add switch' }).click();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect
				.element(
					page.getByRole('alert').filter({
						hasText:
							"The switch was added, but its photo wasn't. Uploads unavailable, try again later."
					})
				)
				.toBeInTheDocument();
		});

		it('says so when the create fails', async () => {
			api.createSwitch.mockRejectedValue(new Error('network'));
			await renderPage();

			await fillNewSwitch();
			await dialog().getByRole('button', { name: 'Add switch' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not create this switch.' }))
				.toBeInTheDocument();
		});
	});

	describe('editing a switch', () => {
		it('saves and returns to the updated switch', async () => {
			api.updateSwitch.mockResolvedValue({ ...aperol, name: 'Aperol V2' });
			await renderPage();
			await openAperol();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByLabelText('Name').fill('Aperol V2');
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect.element(page.getByRole('dialog', { name: 'Aperol V2' })).toBeInTheDocument();
			expect(api.updateSwitch).toHaveBeenCalledWith(
				expect.objectContaining({
					switchId: 'sw-1',
					switchInput: expect.objectContaining({ name: 'Aperol V2' })
				})
			);
		});

		it('says so when the save fails', async () => {
			api.updateSwitch.mockRejectedValue(new Error('network'));
			await renderPage();
			await openAperol();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Save changes' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not save your changes.' }))
				.toBeInTheDocument();
		});

		it('removes the photo and refreshes the switch', async () => {
			api.deleteSwitchImage.mockResolvedValue(undefined);
			api.getSwitch.mockResolvedValue({ ...aperol, image: undefined });
			await renderPage();
			await openAperol();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await dialog().getByRole('button', { name: 'Remove' }).click();

			await expect.element(dialog().getByRole('button', { name: 'Add photo' })).toBeInTheDocument();
			expect(api.deleteSwitchImage).toHaveBeenCalledWith({ userId: 'user-1', switchId: 'sw-1' });
		});

		it('uploads a new photo straight away and refreshes the switch', async () => {
			const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			api.setSwitchImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/t' } as never);
			await renderPage();
			await openAperol();

			await dialog().getByRole('button', { name: 'Edit' }).click();
			await userEvent.upload(fileInput(), png('aperol.png'));

			await vi.waitFor(() =>
				expect(api.getSwitch).toHaveBeenCalledWith({ userId: 'user-1', switchId: 'sw-1' })
			);
			expect(api.setSwitchImage).toHaveBeenCalledWith(
				expect.objectContaining({
					imageUploadRequest: { contentType: 'image/webp', sizeBytes: expect.any(Number) }
				})
			);
			expect(fetchMock).toHaveBeenCalledWith(
				'https://bucket.example/t',
				expect.objectContaining({
					method: 'PUT',
					headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*' }
				})
			);
		});
	});

	it('asks before closing a form with unsaved edits', async () => {
		await renderPage();
		await fillNewSwitch();

		await userEvent.keyboard('{Escape}');

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Discard your changes?' }))
			.toBeInTheDocument();
		await expect.element(dialog().getByLabelText('Name')).toHaveValue('Oil King');
	});

	describe('deleting a switch', () => {
		async function confirmDelete() {
			await dialog().getByRole('button', { name: 'Delete' }).click();
			await expect.element(page.getByText('Delete "Aperol"?')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Confirm delete' }).click();
		}

		it('asks first, then deletes and closes', async () => {
			api.deleteSwitch.mockResolvedValue(undefined);
			await renderPage();
			await openAperol();

			await confirmDelete();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.deleteSwitch).toHaveBeenCalledWith({ userId: 'user-1', switchId: 'sw-1' });
		});

		it('names the builds that still use it', async () => {
			api.deleteSwitch.mockRejectedValue(conflict(['b-1']));
			vi.mocked(buildsApi.getBuild).mockResolvedValue({
				id: 'b-1',
				keyboard: { id: 'kb-1', brand: 'Bowl', name: 'Manta' }
			} as never);
			await renderPage();
			await openAperol();

			await confirmDelete();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'Used in: Manta. Remove it from those builds first.' })
				)
				.toBeInTheDocument();
		});

		it('says it is still used when kbdb names no builds', async () => {
			api.deleteSwitch.mockRejectedValue(conflict());
			await renderPage();
			await openAperol();

			await confirmDelete();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'This switch is still used by one or more builds.' })
				)
				.toBeInTheDocument();
		});

		it('reports any other failure', async () => {
			api.deleteSwitch.mockRejectedValue(new Error('network'));
			await renderPage();
			await openAperol();

			await confirmDelete();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not delete this switch.' }))
				.toBeInTheDocument();
		});
	});
});

describe('switches page image moderation', () => {
	it("doesn't let a check on the old photo land on its replacement", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 }))
		);
		api.listSwitches.mockResolvedValue({
			items: [{ ...aperol, image: { url: PIXEL, status: ImageStatus.Pending } }]
		});
		api.setSwitchImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/s' } as never);
		let resolveOld: (sw: Switch) => void = () => {};
		api.getSwitch
			.mockImplementationOnce(() => new Promise<Switch>((resolve) => (resolveOld = resolve)))
			.mockResolvedValue({ ...aperol, image: { url: PIXEL, status: ImageStatus.Pending } });
		await renderPage();
		await openAperol();
		await dialog().getByRole('button', { name: 'Edit' }).click();

		await userEvent.upload(fileInput(), png('new.png'));
		await vi.waitFor(() => expect(api.getSwitch).toHaveBeenCalledTimes(2));
		resolveOld({ ...aperol, image: { status: ImageStatus.Rejected, rejectionReason: 'Explicit' } });
		await dialog().getByRole('button', { name: 'Close' }).click();

		await expect.element(page.getByRole('img', { name: 'Aperol' })).toBeInTheDocument();
	});

	it('re-fetches a switch with a pending photo when it is opened', async () => {
		api.listSwitches.mockResolvedValue({
			items: [{ ...aperol, image: { url: PIXEL, status: ImageStatus.Pending } }]
		});
		api.getSwitch.mockResolvedValue({
			...aperol,
			image: { url: PIXEL, status: ImageStatus.Approved }
		});
		await renderPage();
		await openAperol();

		await expect.element(dialog().getByTitle('Pending review')).not.toBeInTheDocument();
		expect(api.getSwitch).toHaveBeenCalledTimes(1);
	});
});

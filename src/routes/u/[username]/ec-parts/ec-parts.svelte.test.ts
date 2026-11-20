import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ECPartType,
	ImageStatus,
	ResponseError,
	Visibility,
	type ECPart
} from '@roguekeyboards/mykeebs-api-client';
import { buildsApi, ecPartsApi } from '#lib/api/client.js';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import ECPartsPage from './+page.svelte';

vi.mock('#lib/image-resize.js', () => ({
	prepareImage: async (file: File) =>
		new File([file], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
}));

vi.mock('#lib/api/client.js', () => ({
	ecPartsApi: {
		listECParts: vi.fn(),
		getECPart: vi.fn(),
		createECPart: vi.fn(),
		updateECPart: vi.fn(),
		deleteECPart: vi.fn(),
		setECPartImage: vi.fn(),
		deleteECPartImage: vi.fn()
	},
	buildsApi: { getBuild: vi.fn() },
	lookupsApi: {
		getLookup: vi.fn(async ({ category }: { category: string }) => ({
			values: category === 'ec_dome_material' ? ['Silicone'] : []
		}))
	}
}));

const api = vi.mocked(ecPartsApi);

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const domes: ECPart = {
	id: 'ec-1',
	brand: 'Deskeys',
	name: 'Silicone domes',
	partType: ECPartType.Domes,
	domes: { weight: 45, material: 'Silicone' },
	visibility: Visibility.Public,
	image: { url: PIXEL }
};

const sliders: ECPart = {
	id: 'ec-2',
	brand: 'Keebwerk',
	name: 'MX sliders',
	partType: ECPartType.Sliders,
	sliders: { size: '1U', stem: 'MX' },
	visibility: Visibility.Public
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
	await render(WithUserContext, { component: ECPartsPage, isOwnProfile });
}

const dialog = () => page.getByRole('dialog').last();
const fileInput = () => page.elementLocator(document.querySelector('input[type="file"]')!);

async function openDomes() {
	await page.getByRole('button', { name: /Silicone domes/ }).click();
	await expect.element(page.getByRole('dialog', { name: 'Silicone domes' })).toBeInTheDocument();
}

beforeEach(() => {
	vi.clearAllMocks();
	api.listECParts.mockResolvedValue({ items: [domes, sliders] });
	api.getECPart.mockResolvedValue(domes);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('EC parts page', () => {
	it('lists the parts with their type and specs, and lets the owner add one', async () => {
		await renderPage();

		await expect
			.element(page.getByRole('button', { name: /Silicone domes/ }))
			.toMatchTextContent('Domes · 45g · Silicone');
		await expect
			.element(page.getByRole('button', { name: /MX sliders/ }))
			.toMatchTextContent('Sliders · 1U · MX');
		await expect.element(page.getByRole('button', { name: 'Add EC part' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Part type' })).toBeInTheDocument();
	});

	it('hides adding, editing and deleting from visitors', async () => {
		await renderPage(false);
		await openDomes();

		await expect.element(page.getByRole('button', { name: 'Add EC part' })).not.toBeInTheDocument();
		await expect.element(dialog().getByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		await expect.element(dialog().getByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
	});

	it('filters by part type with the part: tag', async () => {
		await renderPage();
		await expect.element(page.getByRole('button', { name: /MX sliders/ })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Filter' }).click();
		await page.getByRole('option', { name: /part:/ }).click();
		await page.getByRole('option', { name: 'Sliders' }).click();

		await expect.element(page.getByRole('button', { name: /MX sliders/ })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /Silicone domes/ }))
			.not.toBeInTheDocument();
	});

	it('creates a part, uploads the staged photo, and closes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 }))
		);
		api.createECPart.mockResolvedValue({ ...domes, id: 'ec-3', name: 'Rubber domes' });
		api.setECPartImage.mockResolvedValue({ uploadUrl: 'https://bucket.example/e' });
		await renderPage();

		await page.getByRole('button', { name: 'Add EC part' }).click();
		await dialog().getByLabelText('Brand', { exact: false }).fill('Deskeys');
		await dialog().getByLabelText('Name', { exact: false }).fill('Rubber domes');
		await dialog().getByLabelText('Part type', { exact: false }).selectOptions('Domes');
		await userEvent.upload(fileInput(), new File(['x'], 'domes.png', { type: 'image/png' }));
		await dialog().getByRole('button', { name: 'Add EC part' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(api.createECPart).toHaveBeenCalledWith({
			userId: 'user-1',
			eCPartInput: expect.objectContaining({
				brand: 'Deskeys',
				name: 'Rubber domes',
				partType: 'domes'
			})
		});
		expect(api.setECPartImage).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user-1', ecPartId: 'ec-3' })
		);
		expect(api.listECParts).toHaveBeenCalledTimes(2);
	});

	it('says so when the create fails', async () => {
		api.createECPart.mockRejectedValue(new Error('network'));
		await renderPage();

		await page.getByRole('button', { name: 'Add EC part' }).click();
		await dialog().getByLabelText('Brand', { exact: false }).fill('Deskeys');
		await dialog().getByLabelText('Name', { exact: false }).fill('Rubber domes');
		await dialog().getByLabelText('Part type', { exact: false }).selectOptions('Domes');
		await dialog().getByRole('button', { name: 'Add EC part' }).click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not create this EC part.' }))
			.toBeInTheDocument();
	});

	it('saves an edit and returns to the updated part', async () => {
		api.updateECPart.mockResolvedValue({ ...domes, name: 'Silicone domes V2' });
		await renderPage();
		await openDomes();

		await dialog().getByRole('button', { name: 'Edit' }).click();
		await dialog().getByLabelText('Name', { exact: false }).fill('Silicone domes V2');
		await dialog().getByRole('button', { name: 'Save changes' }).click();

		await expect
			.element(page.getByRole('dialog', { name: 'Silicone domes V2' }))
			.toBeInTheDocument();
		expect(api.updateECPart).toHaveBeenCalledWith(
			expect.objectContaining({
				ecPartId: 'ec-1',
				eCPartInput: expect.objectContaining({ name: 'Silicone domes V2' })
			})
		);
	});

	it('removes the photo and refreshes the part', async () => {
		api.deleteECPartImage.mockResolvedValue();
		api.getECPart.mockResolvedValue({ ...domes, image: undefined });
		await renderPage();
		await openDomes();

		await dialog().getByRole('button', { name: 'Edit' }).click();
		await dialog().getByRole('button', { name: 'Remove' }).click();

		await expect.element(dialog().getByRole('button', { name: 'Add photo' })).toBeInTheDocument();
		expect(api.deleteECPartImage).toHaveBeenCalledWith({ userId: 'user-1', ecPartId: 'ec-1' });
	});

	describe('deleting a part', () => {
		async function confirmDelete() {
			await dialog().getByRole('button', { name: 'Delete' }).click();
			await expect.element(page.getByText('Delete "Silicone domes"?')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Confirm delete' }).click();
		}

		it('asks first, then deletes and closes', async () => {
			api.deleteECPart.mockResolvedValue(undefined);
			await renderPage();
			await openDomes();

			await confirmDelete();

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(api.deleteECPart).toHaveBeenCalledWith({ userId: 'user-1', ecPartId: 'ec-1' });
		});

		it('names the builds that still use it', async () => {
			api.deleteECPart.mockRejectedValue(conflict(['b-1']));
			vi.mocked(buildsApi.getBuild).mockResolvedValue({
				id: 'b-1',
				keyboard: { id: 'kb-1', brand: 'Leopold', name: 'FC660C' },
				buildType: 'EC'
			});
			await renderPage();
			await openDomes();

			await confirmDelete();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'Used in: FC660C. Remove it from those builds first.' })
				)
				.toBeInTheDocument();
		});

		it('says it is still used when mykeebs-api names no builds', async () => {
			api.deleteECPart.mockRejectedValue(conflict());
			await renderPage();
			await openDomes();

			await confirmDelete();

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'This EC part is still used by one or more builds.' })
				)
				.toBeInTheDocument();
		});

		it('reports any other failure', async () => {
			api.deleteECPart.mockRejectedValue(new Error('network'));
			await renderPage();
			await openDomes();

			await confirmDelete();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not delete this EC part.' }))
				.toBeInTheDocument();
		});
	});

	it('re-fetches a part with a pending photo when it is opened', async () => {
		api.listECParts.mockResolvedValue({
			items: [{ ...domes, image: { url: PIXEL, status: ImageStatus.Pending } }]
		});
		api.getECPart.mockResolvedValue({
			...domes,
			image: { url: PIXEL, status: ImageStatus.Approved }
		});
		await renderPage();
		await openDomes();

		await expect.element(dialog().getByTitle('Pending review')).not.toBeInTheDocument();
		expect(api.getECPart).toHaveBeenCalledTimes(1);
	});
});

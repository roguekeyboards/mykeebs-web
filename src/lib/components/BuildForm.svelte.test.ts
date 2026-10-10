import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Visibility, type Build } from '@rogueserenity/kbdb-api-client';
import { keyboardsApi } from '$lib/api/client';
import { kitKey, type StaleBuildRefs } from '$lib/build-refs';
import { MAX_IMAGES } from '$lib/image-limit';
import BuildFormWithUser from './test-support/BuildFormWithUser.svelte';
import '../../routes/layout.css';

vi.mock('$lib/api/client', () => ({
	lookupsApi: { getLookup: vi.fn(async () => ({ values: [] })) },
	keyboardsApi: { getKeyboard: vi.fn(async () => ({ id: 'kb', brand: '', name: '' })) },
	switchesApi: {},
	keycapSetsApi: {}
}));

const build: Build = {
	id: 'b',
	visibility: Visibility.Private,
	keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
	switches: [
		{ _switch: { id: 'sw-a', brand: 'HMX', name: 'Aperol', type: 'Linear' }, count: 70 },
		{ _switch: { id: 'sw-b', brand: 'Gateron', name: 'Oil King', type: 'Linear' }, count: 4 }
	],
	keycapSets: [
		{
			id: 'set-1',
			brand: 'GMK',
			name: '8008 2',
			kits: [
				{ kitId: 'base', name: 'Base' },
				{ kitId: 'aesthetic', name: 'Aesthetic' }
			]
		}
	]
};

function renderForm(staleRefs: StaleBuildRefs | null) {
	render(BuildFormWithUser, {
		formProps: {
			initial: build,
			saving: false,
			error: null,
			staleRefs,
			onSubmit: vi.fn(),
			onCancel: vi.fn()
		}
	});
}

const NOTE = 'No longer in your collection';

describe('BuildForm.svelte stale references', () => {
	it('flags only the switches and kits kbdb rejected', async () => {
		renderForm({
			keyboardId: null,
			switchIds: new Set(['sw-b']),
			kitKeys: new Set([kitKey('set-1', 'aesthetic')])
		});

		const items = page.getByRole('listitem');
		await expect.element(items.filter({ hasText: 'Oil King' })).toHaveTextContent(NOTE);
		await expect.element(items.filter({ hasText: '8008 2 — Aesthetic' })).toHaveTextContent(NOTE);
		await expect.element(items.filter({ hasText: 'Aperol' })).not.toHaveTextContent(NOTE);
		await expect.element(items.filter({ hasText: '8008 2 — Base' })).not.toHaveTextContent(NOTE);
	});

	it('flags the keyboard when it is the one kbdb rejected', async () => {
		renderForm({ keyboardId: 'kb', switchIds: new Set(), kitKeys: new Set() });

		await expect.element(page.getByText(NOTE)).toBeInTheDocument();
	});

	it("doesn't flag a keyboard other than the rejected one", async () => {
		renderForm({ keyboardId: 'replaced', switchIds: new Set(), kitKeys: new Set() });

		await expect.element(page.getByText('Manta')).toBeInTheDocument();
		await expect.element(page.getByText(NOTE)).not.toBeInTheDocument();
	});

	it('flags nothing without a stale-reference error', async () => {
		renderForm(null);

		await expect.element(page.getByText('Manta')).toBeInTheDocument();
		await expect.element(page.getByText(NOTE)).not.toBeInTheDocument();
	});
});

describe('BuildForm.svelte cleared stabilizer price', () => {
	function renderWithStabs(stabs: Build['stabs']) {
		const onSubmit = vi.fn();
		render(BuildFormWithUser, {
			formProps: {
				initial: { ...build, stabs },
				saving: false,
				error: null,
				staleRefs: null,
				onSubmit,
				onCancel: vi.fn()
			}
		});
		return onSubmit;
	}

	it('leaves the form clean once the price is typed into and cleared', async () => {
		renderWithStabs({ name: 'Durock V2' });
		const dirty = page.getByTestId('dirty');
		const price = page.getByLabelText('Price');

		await price.fill('15');
		await expect.element(dirty).toHaveTextContent('true');
		await price.fill('');

		await expect.element(dirty).toHaveTextContent('false');
	});

	it('drops a cleared price rather than keeping the old value', async () => {
		const onSubmit = renderWithStabs({ name: 'Durock V2', price: 15 });

		await page.getByLabelText('Price').fill('');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		expect(onSubmit.mock.calls[0][0].stabs?.price).toBeNullable();
	});
});

describe('BuildForm.svelte switch counts', () => {
	function renderBuild() {
		const onSubmit = vi.fn();
		render(BuildFormWithUser, {
			formProps: {
				initial: build,
				saving: false,
				error: null,
				staleRefs: null,
				onSubmit,
				onCancel: vi.fn()
			}
		});
		return onSubmit;
	}

	const countFor = (label: string) => page.getByRole('spinbutton', { name: `Count of ${label}` });

	it('refuses to save a switch whose count was cleared', async () => {
		const onSubmit = renderBuild();

		await countFor('Oil King (Gateron)').fill('');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect
			.element(
				page.getByRole('alert').filter({ hasText: 'Every switch needs a count of at least 1.' })
			)
			.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
		await expect.element(countFor('Oil King (Gateron)')).toBeInvalid();
		await expect
			.element(countFor('Oil King (Gateron)'))
			.toHaveAccessibleDescription('Every switch needs a count of at least 1.');
		await expect.element(countFor('Aperol (HMX)')).not.toBeInvalid();
	});

	it('saves once every switch has a count again', async () => {
		const onSubmit = renderBuild();

		await countFor('Oil King (Gateron)').fill('');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await countFor('Oil King (Gateron)').fill('6');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		expect(onSubmit.mock.calls[0][0].switches).toEqual([
			{ _switch: 'sw-a', count: 70 },
			{ _switch: 'sw-b', count: 6 }
		]);
		await expect
			.element(
				page.getByRole('alert').filter({ hasText: 'Every switch needs a count of at least 1.' })
			)
			.not.toBeInTheDocument();
	});
});

describe('BuildForm.svelte switch rows', () => {
	it('names each count field after its switch and keeps the switch name visible', async () => {
		renderForm(null);

		for (const label of ['Aperol (HMX)', 'Oil King (Gateron)']) {
			await expect
				.element(page.getByRole('spinbutton', { name: `Count of ${label}` }))
				.toBeInTheDocument();
			await expect.element(page.getByText(label)).toBeVisible();
		}
	});
});

describe('BuildForm.svelte remove buttons', () => {
	it('names each remove button after its row and removes only that row', async () => {
		renderForm(null);

		await page.getByRole('button', { name: 'Remove Oil King (Gateron)' }).click();
		await page.getByRole('button', { name: 'Remove 8008 2 — Aesthetic' }).click();

		await expect.element(page.getByText('Oil King (Gateron)')).not.toBeInTheDocument();
		await expect.element(page.getByText('8008 2 — Aesthetic')).not.toBeInTheDocument();
		await expect.element(page.getByText('Aperol (HMX)')).toBeInTheDocument();
		await expect.element(page.getByText('8008 2 — Base')).toBeInTheDocument();
	});
});

describe('BuildForm.svelte image remove buttons', () => {
	it('numbers each image remove button and removes the right image', async () => {
		const onImageRemove = vi.fn(async () => {});
		render(BuildFormWithUser, {
			formProps: {
				initial: {
					...build,
					images: [
						{ imageId: 'img-1', url: 'https://img.example/1.png' },
						{ imageId: 'img-2', url: 'https://img.example/2.png' }
					]
				},
				saving: false,
				error: null,
				staleRefs: null,
				onSubmit: vi.fn(),
				onCancel: vi.fn(),
				onImageRemove
			}
		});

		await expect
			.element(page.getByRole('button', { name: 'Remove image 1 of 2' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Remove image 2 of 2' }).click();

		expect(onImageRemove).toHaveBeenCalledWith('img-2');
	});
});

describe('BuildForm.svelte removing a photo', () => {
	it('says so when the removal fails, and lets you try again', async () => {
		render(BuildFormWithUser, {
			formProps: {
				initial: { ...build, images: [{ imageId: 'img-1', url: 'https://img.example/1.png' }] },
				saving: false,
				error: null,
				staleRefs: null,
				onSubmit: vi.fn(),
				onCancel: vi.fn(),
				onImageRemove: vi.fn().mockRejectedValue(new Error('network'))
			}
		});

		await page.getByRole('button', { name: 'Remove image 1 of 1' }).click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Could not remove the image.' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Remove image 1 of 1' }))
			.not.toBeDisabled();
	});
});

describe('BuildForm.svelte photo limit', () => {
	const fileInput = () => page.elementLocator(document.querySelector('input[type="file"]')!);
	const jpg = (name: string) => new File([name], name, { type: 'image/jpeg' });
	const withImages = (count: number): Build => ({
		...build,
		images: Array.from({ length: count }, (_, i) => ({
			imageId: `img-${i}`,
			url: `https://img.example/${i}.png`
		}))
	});

	function renderWith(props: Partial<Parameters<typeof BuildFormWithUser>[1]['formProps']>) {
		render(BuildFormWithUser, {
			formProps: {
				saving: false,
				error: null,
				staleRefs: null,
				onSubmit: vi.fn(),
				onCancel: vi.fn(),
				...props
			}
		});
	}

	it(`disables adding photos once there are ${MAX_IMAGES}`, async () => {
		renderWith({ initial: withImages(MAX_IMAGES) });

		await expect.element(page.getByRole('button', { name: '+ Add photo' })).toBeDisabled();
		await expect
			.element(page.getByText(`Up to ${MAX_IMAGES} photos. Remove one to add another.`))
			.toBeInTheDocument();
	});

	it('uploads only the picked photos that fit, and says how many were left out', async () => {
		const onImageUpload = vi.fn(async () => {});
		renderWith({ initial: withImages(MAX_IMAGES - 1), onImageUpload });
		const [a, b] = [jpg('a.jpg'), jpg('b.jpg')];

		await userEvent.upload(fileInput(), [a, b]);

		await expect
			.element(
				page
					.getByRole('alert')
					.filter({ hasText: `Up to ${MAX_IMAGES} photos are allowed, so 1 was not added.` })
			)
			.toBeInTheDocument();
		expect(onImageUpload.mock.calls).toEqual([[a]]);
	});

	it(`stages at most ${MAX_IMAGES} photos on a new build`, async () => {
		renderWith({});
		const picked = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => jpg(`${i}.jpg`));

		await userEvent.upload(fileInput(), picked);

		await expect
			.element(
				page
					.getByRole('alert')
					.filter({ hasText: `Up to ${MAX_IMAGES} photos are allowed, so 1 was not added.` })
			)
			.toBeInTheDocument();
		expect(page.getByAltText('Selected build').elements()).toHaveLength(MAX_IMAGES);
		await expect.element(page.getByRole('button', { name: '+ Add photo' })).toBeDisabled();
	});

	it('moves focus to + Add photo after a photo is removed', async () => {
		renderWith({ initial: withImages(2), onImageRemove: vi.fn(async () => {}) });

		await page.getByRole('button', { name: 'Remove image 2 of 2' }).click();

		await expect.element(page.getByRole('button', { name: '+ Add photo' })).toHaveFocus();
	});
});

describe('BuildForm.svelte keyboard', () => {
	it('points the keyboard button at the error when no keyboard was chosen', async () => {
		render(BuildFormWithUser, {
			formProps: {
				saving: false,
				error: null,
				staleRefs: null,
				onSubmit: vi.fn(),
				onCancel: vi.fn()
			}
		});

		await page.getByRole('button', { name: 'Add build' }).click();

		await expect
			.element(page.getByRole('button', { name: 'Choose keyboard…' }))
			.toHaveAccessibleDescription('A keyboard is required.');
	});
});

describe('BuildForm.svelte plate and PCB', () => {
	function renderParts(getKeyboard: () => Promise<unknown>) {
		vi.mocked(keyboardsApi.getKeyboard).mockImplementationOnce(getKeyboard as never);
		const onSubmit = vi.fn();
		render(BuildFormWithUser, {
			formProps: {
				initial: {
					...build,
					plate: { id: 'p2', material: 'POM', color: 'Black', thickness: 1.2 },
					pcb: { id: 'c1', assembly: 'Hotswap', firmware: 'QMK' }
				},
				saving: false,
				error: null,
				onSubmit,
				onCancel: vi.fn()
			}
		});
		return onSubmit;
	}

	const plate = () => page.getByLabelText('Plate');
	const pcb = () => page.getByLabelText('PCB');

	it("offers the keyboard's parts by id, labelled to tell same-material plates apart", async () => {
		const onSubmit = renderParts(async () => ({
			id: 'kb',
			brand: 'Bowl',
			name: 'Manta',
			plates: [
				{ id: 'p1', material: 'POM', thickness: 1.5 },
				{ id: 'p2', material: 'POM', color: 'Black', thickness: 1.2 }
			],
			pcbs: [
				{ id: 'c1', assembly: 'Hotswap', firmware: 'QMK' },
				{ id: 'c2', assembly: 'Solder', connectivity: 'Wireless' }
			]
		}));

		await expect.element(plate().getByRole('option', { name: 'POM · 1.5mm' })).toBeInTheDocument();
		await expect.element(plate()).toHaveValue('p2');
		await expect.element(pcb()).toHaveValue('c1');
		await expect.element(page.getByTestId('dirty')).toHaveTextContent('false');

		await plate().selectOptions('POM · 1.5mm');
		await pcb().selectOptions('Solder · Wireless');
		await expect.element(page.getByTestId('dirty')).toHaveTextContent('true');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ plate: 'p1', pcb: 'c2' });
	});

	it("keeps the build's own plate and PCB when the keyboard can't be loaded", async () => {
		const onSubmit = renderParts(() => Promise.reject(new Error('network')));

		await expect.element(plate()).toHaveValue('p2');
		await expect.element(pcb()).toHaveValue('c1');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ plate: 'p2', pcb: 'c1' });
	});
});

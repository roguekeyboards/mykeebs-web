import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ImageStatus,
	ResponseError,
	Visibility,
	type Keyboard,
	type KeyboardInput
} from '@rogueserenity/kbdb-api-client';
import { lookupsApi } from '#lib/api/client.js';
import { todayDateInput } from '#lib/format.js';
import { pcbInput, plateInput, type KeyboardParts } from '#lib/keyboard-parts.js';
import { MAX_IMAGES } from '#lib/image-limit.js';
import KeyboardForm from './KeyboardForm.svelte';
import FormWithDirty from './test-support/FormWithDirty.svelte';

vi.mock('#lib/api/client.js', () => ({ lookupsApi: { getLookup: vi.fn() } }));

const lookups: Record<string, unknown[]> = {
	keyboard_size: ['60%', '65%', 'TKL'],
	keyboard_layout: [
		{ name: 'ANSI', sizes: ['60%', '65%', 'TKL'] },
		{ name: 'HHKB', sizes: ['60%'] },
		{ name: 'Alice', sizes: ['65%'] }
	],
	keyboard_case_material: ['Aluminum', 'Polycarbonate'],
	keyboard_weight_material: ['Brass', 'Stainless steel'],
	keyboard_plate_material: ['FR4', 'POM', 'Aluminum'],
	keyboard_pcb_firmware: ['QMK', 'VIA'],
	keyboard_pcb_assembly_type: ['Hotswap', 'Solder'],
	keyboard_pcb_connectivity_type: ['Wired', 'Wireless'],
	vendor: ['CannonKeys', 'NovelKeys'],
	order_status: ['Planned', 'Ordered', 'Delivered']
};

const keyboard: Keyboard = {
	id: 'kb-1',
	brand: 'Bowl',
	name: 'Manta',
	size: '65%',
	layout: 'Alice',
	design: {
		topCase: { material: 'Aluminum', color: 'E-white' },
		bottomCase: { material: 'Polycarbonate' },
		weight: { material: 'Brass', color: 'Mirror' }
	},
	plates: [
		{ id: 'plate-1', material: 'POM' },
		{ id: 'plate-2', material: 'Carbon fiber', color: 'Black', thickness: 1.5 }
	],
	pcbs: [
		{ id: 'pcb-1', thickness: 1.2, firmware: 'QMK', assembly: 'Hotswap', connectivity: 'Wired' }
	],
	purchase: {
		vendor: 'Group buy direct',
		price: 450,
		orderDate: new Date('2026-01-15'),
		deliveryDate: new Date('2026-08-02'),
		orderStatus: 'Delivered'
	},
	notes: 'Endgame, allegedly.',
	visibility: Visibility.Public,
	images: [{ imageId: 'img-1', url: 'https://img.example/1.png' }]
};

function withImages(count: number): Keyboard {
	return {
		...keyboard,
		images: Array.from({ length: count }, (_, i) => ({
			imageId: `img-${i}`,
			url: `https://img.example/${i}.png`
		}))
	};
}

async function renderForm(props: Partial<Parameters<typeof KeyboardForm>[1]> = {}) {
	const mocks = { onSubmit: vi.fn(), onCancel: vi.fn() };
	await render(FormWithDirty, {
		form: KeyboardForm,
		formProps: { saving: false, error: null, ...mocks, ...props }
	});
	return mocks;
}

async function submit(name = 'Add keyboard') {
	await page.getByRole('button', { name }).click();
}

type PartInput<T> = T & { id?: string };
type Submitted = KeyboardInput & {
	plates: PartInput<ReturnType<typeof plateInput>>[];
	pcbs: PartInput<ReturnType<typeof pcbInput>>[];
};

function submission(
	onSubmit: ReturnType<typeof vi.fn>,
	call: number
): [Submitted, File[] | undefined] {
	const [input, files, parts] = onSubmit.mock.calls[call] as [
		KeyboardInput,
		File[] | undefined,
		KeyboardParts
	];
	return [
		{
			...input,
			plates: parts.plates.map((p) => ({ id: p.id, ...plateInput(p) })),
			pcbs: parts.pcbs.map((p) => ({ id: p.id, ...pcbInput(p) }))
		},
		files
	];
}

function submitted(onSubmit: ReturnType<typeof vi.fn>): [Submitted, File[] | undefined] {
	expect(onSubmit).toHaveBeenCalledOnce();
	return submission(onSubmit, 0);
}

async function openSection(section: string) {
	await page
		.getByText(new RegExp(`^${section} —`))
		.last()
		.click();
}

const dirty = () => page.getByTestId('dirty');

const part = (name: string) => page.getByRole('group', { name, exact: true });

const keyboardPurchase = () =>
	page.getByRole('group').filter({ has: page.getByLabelText('Base price') });

describe('KeyboardForm.svelte', () => {
	beforeEach(() => {
		vi.mocked(lookupsApi.getLookup).mockReset();
		vi.mocked(lookupsApi.getLookup).mockImplementation(
			async ({ category }) => ({ category, values: lookups[category] }) as never
		);
	});

	it('requires a brand and name', async () => {
		const { onSubmit } = await renderForm();

		await page.getByLabelText('Brand').fill('   ');
		await submit();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Brand and name are required.' }))
			.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('marks brand and name required, and flags only the empty ones after a failed save', async () => {
		await renderForm();
		const brand = page.getByLabelText('Brand');
		const name = page.getByLabelText('Name');
		await expect.element(brand).toBeRequired();
		await expect.element(name).toBeRequired();
		await expect.element(name).not.toBeInvalid();

		await brand.fill('Bowl');
		await submit();

		await expect.element(name).toBeInvalid();
		await expect.element(name).toHaveAccessibleDescription('Brand and name are required.');
		await expect.element(brand).not.toBeInvalid();
	});

	it('submits a minimal keyboard trimmed, private, and without empty sections', async () => {
		const { onSubmit } = await renderForm();

		await page.getByLabelText('Brand').fill('  Bowl ');
		await page.getByLabelText('Name').fill(' Manta  ');
		await submit();

		expect(submitted(onSubmit)).toEqual([
			{
				brand: 'Bowl',
				name: 'Manta',
				size: undefined,
				layout: undefined,
				design: undefined,
				plates: [],
				pcbs: [],
				purchase: undefined,
				notes: undefined,
				visibility: Visibility.Private
			},
			undefined
		]);
	});

	it('nests every section that has a value into the submitted keyboard', async () => {
		const { onSubmit } = await renderForm();

		await page.getByLabelText('Brand').fill('Bowl');
		await page.getByLabelText('Name').fill('Manta');
		await page.getByRole('radio', { name: 'Public' }).click();
		await page.getByLabelText('Size').selectOptions('65%');
		await page.getByLabelText('Layout').selectOptions('Alice');

		await openSection('Design');
		await page.getByLabelText('Top case material').selectOptions('Aluminum');
		await page.getByLabelText('Bottom case color').fill(' Navy ');

		await openSection('Plates');
		await page.getByRole('button', { name: '+ Add plate' }).click();
		await part('Plate 1').getByLabelText('Material').selectOptions('POM');
		await page.getByRole('button', { name: '+ Add plate' }).click();
		await part('Plate 2').getByLabelText('Material').selectOptions('FR4');
		await part('Plate 2').getByLabelText('Color').fill(' Green ');

		await openSection('PCBs');
		await page.getByRole('button', { name: '+ Add PCB' }).click();
		await part('PCB 1').getByLabelText('Thickness (mm)').fill('1.6');
		await part('PCB 1').getByLabelText('Assembly').selectOptions('Solder');
		await part('PCB 1').getByLabelText('Connectivity').selectOptions('Wireless');

		await openSection('Purchase');
		await keyboardPurchase().getByLabelText('Vendor').selectOptions('NovelKeys');
		await page.getByLabelText('Base price').fill('399.5');

		await page.getByLabelText('Notes').fill(' First Alice ');
		await submit();

		const [input] = submitted(onSubmit);
		expect(input).toEqual({
			brand: 'Bowl',
			name: 'Manta',
			size: '65%',
			layout: 'Alice',
			design: {
				topCase: { material: 'Aluminum', color: undefined },
				bottomCase: { material: undefined, color: 'Navy' },
				weight: undefined
			},
			plates: [{ material: 'POM' }, { material: 'FR4', color: 'Green' }],
			pcbs: [{ thickness: 1.6, assembly: 'Solder', connectivity: 'Wireless' }],
			purchase: {
				vendor: 'NovelKeys',
				price: 399.5,
				orderDate: undefined,
				deliveryDate: undefined,
				orderStatus: undefined
			},
			notes: 'First Alice',
			visibility: Visibility.Public
		});
	});

	it('round-trips an existing keyboard untouched, including values the lookups no longer offer', async () => {
		const { onSubmit } = await renderForm({ initial: keyboard });

		await expect.element(page.getByRole('heading', { name: 'Edit keyboard' })).toBeInTheDocument();
		await expect
			.element(keyboardPurchase().getByLabelText('Vendor'))
			.toHaveValue('Group buy direct');
		await expect.element(part('Plate 2').getByLabelText('Material')).toHaveValue('Carbon fiber');
		await submit('Save changes');

		const [input] = submitted(onSubmit);
		expect(input).toEqual({
			brand: 'Bowl',
			name: 'Manta',
			size: '65%',
			layout: 'Alice',
			design: {
				topCase: { material: 'Aluminum', color: 'E-white' },
				bottomCase: { material: 'Polycarbonate', color: undefined },
				weight: { material: 'Brass', color: 'Mirror' }
			},
			plates: [
				{ id: 'plate-1', material: 'POM' },
				{ id: 'plate-2', material: 'Carbon fiber', color: 'Black', thickness: 1.5 }
			],
			pcbs: [
				{ id: 'pcb-1', thickness: 1.2, firmware: 'QMK', assembly: 'Hotswap', connectivity: 'Wired' }
			],
			purchase: {
				vendor: 'Group buy direct',
				price: 450,
				orderDate: new Date('2026-01-15'),
				deliveryDate: new Date('2026-08-02'),
				orderStatus: 'Delivered'
			},
			notes: 'Endgame, allegedly.',
			visibility: Visibility.Public
		});
	});

	it('summarizes each section and opens the ones an existing keyboard fills', async () => {
		await renderForm({ initial: keyboard });

		await expect.element(page.getByText('— top case · bottom case · weight')).toBeVisible();
		await expect.element(page.getByText('— POM · Carbon fiber')).toBeVisible();
		await expect.element(page.getByText('— Hotswap · QMK · Wired · 1.2mm')).toBeVisible();
		await expect.element(page.getByText('— Group buy direct · Delivered')).toBeVisible();
		await expect.element(part('PCB 1').getByLabelText('Thickness (mm)')).toBeVisible();
	});

	it('starts with every section collapsed and unset for a new keyboard', async () => {
		await renderForm();

		await expect.element(page.getByText('— Not set').nth(1)).toBeInTheDocument();
		await expect.element(page.getByText('— None').nth(1)).toBeInTheDocument();
		await expect.element(page.getByText('+ Add plate')).not.toBeVisible();
	});

	it("labels the keyboard's own price as the base price", async () => {
		await renderForm({ initial: keyboard });

		await expect
			.element(page.getByLabelText('Base price'))
			.toHaveAccessibleDescription('Excludes plates and PCBs bought separately.');
	});

	describe('plates and PCBs', () => {
		it("keeps each part's id, and leaves out a removed one", async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await page.getByRole('button', { name: 'Remove plate 1' }).click();
			await part('PCB 1').getByLabelText('Firmware').selectOptions('VIA');
			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.plates).toEqual([
				{ id: 'plate-2', material: 'Carbon fiber', color: 'Black', thickness: 1.5 }
			]);
			expect(input.pcbs).toEqual([
				{ id: 'pcb-1', thickness: 1.2, firmware: 'VIA', assembly: 'Hotswap', connectivity: 'Wired' }
			]);
		});

		it('adds a new part without an id next to the existing ones', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await page.getByRole('button', { name: '+ Add plate' }).click();
			await part('Plate 3').getByLabelText('Material').selectOptions('Aluminum');
			await submit('Save changes');

			const plates = submitted(onSubmit)[0].plates!;
			expect(plates.map((p) => p.id)).toEqual(['plate-1', 'plate-2', undefined]);
			expect(plates[2]).toEqual({ material: 'Aluminum' });
		});

		it('requires a material on every plate', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await page.getByRole('button', { name: '+ Add plate' }).click();
			await submit('Save changes');

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Every plate needs a material.' }))
				.toBeInTheDocument();
			await expect.element(part('Plate 3').getByLabelText('Material')).toBeInvalid();
			await expect.element(part('Plate 1').getByLabelText('Material')).not.toBeInvalid();
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('requires an assembly and connectivity on every PCB', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await page.getByRole('button', { name: '+ Add PCB' }).click();
			await part('PCB 2').getByLabelText('Assembly').selectOptions('Hotswap');
			await submit('Save changes');

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: 'Every PCB needs an assembly and connectivity.' })
				)
				.toBeInTheDocument();
			await expect.element(part('PCB 2').getByLabelText('Connectivity')).toBeInvalid();
			await expect.element(part('PCB 2').getByLabelText('Assembly')).not.toBeInvalid();
			await expect.element(part('PCB 1').getByLabelText('Connectivity')).not.toBeInvalid();
			expect(onSubmit).not.toHaveBeenCalled();

			await part('PCB 2').getByLabelText('Connectivity').selectOptions('Wired');
			await submit('Save changes');
			expect(submitted(onSubmit)[0].pcbs?.[1]).toEqual({
				assembly: 'Hotswap',
				connectivity: 'Wired'
			});
		});

		it('gives a part bought separately its own purchase', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await expect.element(part('PCB 1').getByText('— Came with the keyboard')).toBeVisible();
			await part('PCB 1')
				.getByText(/^Purchase —/)
				.click();
			await part('PCB 1').getByLabelText('Vendor').selectOptions('CannonKeys');
			await part('PCB 1').getByLabelText('Price').fill('65');
			await part('PCB 1').getByLabelText('Order status').selectOptions('Ordered');
			await expect
				.element(part('PCB 1').getByLabelText('Order date'))
				.toHaveValue(todayDateInput());
			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.pcbs?.[0].purchase).toEqual({
				vendor: 'CannonKeys',
				price: 65,
				orderDate: new Date(todayDateInput()),
				orderStatus: 'Ordered'
			});
			expect(input.purchase?.price).toBe(450);
		});

		it("round-trips a part's purchase, and drops it once cleared", async () => {
			const withPurchase: Keyboard = {
				...keyboard,
				plates: [
					{
						id: 'plate-1',
						material: 'POM',
						purchase: { vendor: 'CannonKeys', price: 30, currency: 'USD', orderStatus: 'Planned' }
					}
				]
			};
			const first = await renderForm({ initial: withPurchase });
			await expect.element(part('Plate 1').getByLabelText('Vendor')).toBeVisible();
			await expect.element(part('Plate 1').getByText('— CannonKeys · Planned')).toBeVisible();
			await submit('Save changes');
			expect(submitted(first.onSubmit)[0].plates?.[0].purchase).toEqual({
				vendor: 'CannonKeys',
				price: 30,
				orderStatus: 'Planned'
			});

			await part('Plate 1').getByLabelText('Vendor').selectOptions('—');
			await part('Plate 1').getByLabelText('Order status').selectOptions('—');
			await part('Plate 1').getByLabelText('Price').fill('');
			await submit('Save changes');
			expect(submission(first.onSubmit, 1)[0].plates[0]).toEqual({
				id: 'plate-1',
				material: 'POM'
			});
		});
	});

	it('offers only the layouts that fit the chosen size', async () => {
		await renderForm();

		await page.getByLabelText('Size').selectOptions('60%');

		const layout = page.getByLabelText('Layout');
		await expect.element(layout.getByRole('option', { name: 'HHKB' })).toBeInTheDocument();
		await expect.element(layout.getByRole('option', { name: 'Alice' })).not.toBeInTheDocument();
	});

	it('clears the layout when the size changes to one it does not fit', async () => {
		await renderForm();

		await page.getByLabelText('Size').selectOptions('65%');
		await page.getByLabelText('Layout').selectOptions('Alice');
		await page.getByLabelText('Size').selectOptions('60%');

		await expect.element(page.getByLabelText('Layout')).toHaveValue('');
	});

	it('keeps the layout when the size changes to one it still fits', async () => {
		await renderForm();

		await page.getByLabelText('Size').selectOptions('65%');
		await page.getByLabelText('Layout').selectOptions('ANSI');
		await page.getByLabelText('Size').selectOptions('TKL');

		await expect.element(page.getByLabelText('Layout')).toHaveValue('ANSI');
	});

	describe('order dates', () => {
		it('asks for an order date, defaulting to today, once ordered', async () => {
			await renderForm();
			await openSection('Purchase');

			await keyboardPurchase().getByLabelText('Order status').selectOptions('Planned');
			await expect.element(keyboardPurchase().getByLabelText('Order date')).not.toBeInTheDocument();

			await keyboardPurchase().getByLabelText('Order status').selectOptions('Ordered');
			await expect
				.element(keyboardPurchase().getByLabelText('Order date'))
				.toHaveValue(todayDateInput());
			await expect
				.element(keyboardPurchase().getByLabelText('Delivery date'))
				.not.toBeInTheDocument();
		});

		it('asks for a delivery date, defaulting to today, once delivered', async () => {
			await renderForm();
			await openSection('Purchase');

			await keyboardPurchase().getByLabelText('Order status').selectOptions('Delivered');

			await expect
				.element(keyboardPurchase().getByLabelText('Order date'))
				.toHaveValue(todayDateInput());
			await expect
				.element(keyboardPurchase().getByLabelText('Delivery date'))
				.toHaveValue(todayDateInput());
		});

		it('keeps a date the user already picked when the status moves on', async () => {
			await renderForm();
			await openSection('Purchase');

			await keyboardPurchase().getByLabelText('Order status').selectOptions('Ordered');
			await keyboardPurchase().getByLabelText('Order date').fill('2026-03-04');
			await keyboardPurchase().getByLabelText('Order status').selectOptions('Delivered');

			await expect
				.element(keyboardPurchase().getByLabelText('Order date'))
				.toHaveValue('2026-03-04');
		});

		it('drops dates the new status would not have', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await keyboardPurchase().getByLabelText('Order status').selectOptions('Planned');
			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.purchase?.orderDate).toBeUndefined();
			expect(input.purchase?.deliveryDate).toBeUndefined();
		});

		it('leaves existing dates alone on open, even if the status would not set them', async () => {
			const { onSubmit } = await renderForm({
				initial: { ...keyboard, purchase: { ...keyboard.purchase, orderStatus: 'Planned' } }
			});

			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.purchase?.orderDate).toEqual(new Date('2026-01-15'));
			expect(input.purchase?.deliveryDate).toEqual(new Date('2026-08-02'));
		});
	});

	describe('dirty', () => {
		it('starts clean for an existing keyboard', async () => {
			await renderForm({ initial: keyboard });

			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('turns dirty on an edit and clean again when it is undone', async () => {
			await renderForm({ initial: keyboard });

			await page.getByLabelText('Name').fill('Manta 2');
			await expect.element(dirty()).toHaveTextContent('true');

			await page.getByLabelText('Name').fill('Manta');
			await expect.element(dirty()).toHaveTextContent('false');
		});

		it("tracks edits to a part's fields", async () => {
			await renderForm({ initial: keyboard });

			await part('Plate 2').getByLabelText('Color').fill('White');
			await expect.element(dirty()).toHaveTextContent('true');
			await part('Plate 2').getByLabelText('Color').fill('Black');

			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('stays dirty when a removed part is replaced by an identical new one', async () => {
			await renderForm({ initial: { ...keyboard, plates: [{ id: 'plate-1', material: 'POM' }] } });

			await page.getByRole('button', { name: 'Remove plate 1' }).click();
			await page.getByRole('button', { name: '+ Add plate' }).click();
			await part('Plate 1').getByLabelText('Material').selectOptions('POM');

			await expect.element(dirty()).toHaveTextContent('true');
		});

		it('turns dirty when a part is added or removed', async () => {
			await renderForm({ initial: keyboard });

			await page.getByRole('button', { name: 'Remove PCB 1' }).click();
			await expect.element(dirty()).toHaveTextContent('true');
		});

		it('turns dirty when a photo is staged', async () => {
			await renderForm();

			await userEvent.upload(fileInput(), [png('a.png')]);

			await expect.element(dirty()).toHaveTextContent('true');
		});
	});

	describe('images on a new keyboard', () => {
		it('stages picked photos and submits them with the keyboard', async () => {
			const { onSubmit } = await renderForm();
			const a = png('a.png');
			const b = png('b.png');

			await userEvent.upload(fileInput(), [a, b]);
			await expect.element(page.getByAltText('Selected keyboard').nth(1)).toBeInTheDocument();

			await page.getByLabelText('Brand').fill('Bowl');
			await page.getByLabelText('Name').fill('Manta');
			await submit();

			expect(submitted(onSubmit)[1]?.map((f) => f.name)).toEqual(['a.png', 'b.png']);
		});

		it(`stages at most ${MAX_IMAGES} photos and says how many were left out`, async () => {
			const { onSubmit } = await renderForm();
			const picked = Array.from({ length: MAX_IMAGES + 2 }, (_, i) => png(`${i}.png`));

			await userEvent.upload(fileInput(), picked);

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: `Up to ${MAX_IMAGES} photos are allowed, so 2 were not added.` })
				)
				.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: '+ Add photo' })).toBeDisabled();
			await page.getByLabelText('Brand').fill('Bowl');
			await page.getByLabelText('Name').fill('Manta');
			await submit();

			expect(submitted(onSubmit)[1]?.map((f) => f.name)).toEqual(
				picked.slice(0, MAX_IMAGES).map((f) => f.name)
			);
		});

		it('drops a staged photo when it is removed', async () => {
			const { onSubmit } = await renderForm();
			const a = png('a.png');
			const b = png('b.png');

			await userEvent.upload(fileInput(), [a, b]);
			await page.getByRole('button', { name: 'Remove image 2 of 2' }).click();
			await page.getByLabelText('Brand').fill('Bowl');
			await page.getByLabelText('Name').fill('Manta');
			await submit();

			expect(submitted(onSubmit)[1]?.map((f) => f.name)).toEqual(['a.png']);
		});
	});

	describe('images on an existing keyboard', () => {
		it('keeps unsaved edits when the keyboard refreshes, while showing its new photos', async () => {
			const mocks = { onSubmit: vi.fn(), onCancel: vi.fn() };
			const formProps = { saving: false, error: null, ...mocks, initial: keyboard };
			const { rerender } = await render(FormWithDirty, { form: KeyboardForm, formProps });
			await page.getByLabelText('Name').fill('Manta R2');

			await rerender({
				form: KeyboardForm,
				formProps: {
					...formProps,
					initial: {
						...keyboard,
						images: [...keyboard.images!, { imageId: 'img-2', url: 'https://img.example/2.png' }]
					}
				}
			});

			await expect
				.element(page.getByRole('button', { name: 'Remove image 2 of 2' }))
				.toBeInTheDocument();
			await expect.element(page.getByLabelText('Name')).toHaveValue('Manta R2');
			await expect.element(dirty()).toHaveTextContent('true');
		});

		it('uploads a picked photo straight away', async () => {
			const onImageUpload = vi.fn(async () => {});
			await renderForm({ initial: keyboard, onImageUpload });
			const a = png('a.png');

			await userEvent.upload(fileInput(), [a]);

			await vi.waitFor(() => expect(onImageUpload).toHaveBeenCalledWith(a));
		});

		it('says so when an upload fails', async () => {
			await renderForm({
				initial: keyboard,
				onImageUpload: vi.fn().mockRejectedValue(new Error('x'))
			});

			await userEvent.upload(fileInput(), [png('a.png')]);

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not upload that image.' }))
				.toBeInTheDocument();
		});

		it('says uploads are unavailable when kbdb refuses with a 429', async () => {
			await renderForm({
				initial: keyboard,
				onImageUpload: vi
					.fn()
					.mockRejectedValue(new ResponseError(new Response(null, { status: 429 })))
			});

			await userEvent.upload(fileInput(), [png('a.png')]);

			await expect
				.element(
					page.getByRole('alert').filter({ hasText: 'Uploads unavailable, try again later.' })
				)
				.toBeInTheDocument();
		});

		it('marks a photo that is pending review', async () => {
			await renderForm({
				initial: {
					...keyboard,
					images: [
						{ imageId: 'img-1', url: 'https://img.example/1.png', status: ImageStatus.Pending }
					]
				}
			});

			await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
		});

		it('shows a rejected photo by its reason, removable and counted toward the limit', async () => {
			const onImageRemove = vi.fn(async () => {});
			const initial = withImages(MAX_IMAGES - 1);
			initial.images!.push({
				imageId: 'rejected',
				status: ImageStatus.Rejected,
				rejectionReason: 'Explicit'
			});
			await renderForm({ initial, onImageRemove });

			await expect
				.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: '+ Add photo' })).toBeDisabled();
			await page
				.getByRole('button', { name: `Remove image ${MAX_IMAGES} of ${MAX_IMAGES}` })
				.click();
			expect(onImageRemove).toHaveBeenCalledWith('rejected');
		});

		it(`disables adding photos once there are ${MAX_IMAGES}`, async () => {
			await renderForm({ initial: withImages(MAX_IMAGES) });

			await expect.element(page.getByRole('button', { name: '+ Add photo' })).toBeDisabled();
			await expect
				.element(page.getByText(`Up to ${MAX_IMAGES} photos. Remove one to add another.`))
				.toBeInTheDocument();
		});

		it('uploads only the picked photos that fit, and says how many were left out', async () => {
			const onImageUpload = vi.fn(async () => {});
			await renderForm({ initial: withImages(MAX_IMAGES - 2), onImageUpload });
			const [a, b, c] = [png('a.png'), png('b.png'), png('c.png')];

			await userEvent.upload(fileInput(), [a, b, c]);

			await expect
				.element(
					page
						.getByRole('alert')
						.filter({ hasText: `Up to ${MAX_IMAGES} photos are allowed, so 1 was not added.` })
				)
				.toBeInTheDocument();
			expect(onImageUpload.mock.calls).toEqual([[a], [b]]);
		});

		it('removes a photo by its id', async () => {
			const onImageRemove = vi.fn(async () => {});
			await renderForm({ initial: keyboard, onImageRemove });

			await page.getByRole('button', { name: 'Remove image 1 of 1' }).click();

			expect(onImageRemove).toHaveBeenCalledWith('img-1');
		});

		it('says so when removing a photo fails, and lets you try again', async () => {
			const onImageRemove = vi.fn().mockRejectedValue(new Error('network'));
			await renderForm({ initial: keyboard, onImageRemove });

			await page.getByRole('button', { name: 'Remove image 1 of 1' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not remove the image.' }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Remove image 1 of 1' }))
				.not.toBeDisabled();
		});
	});

	describe('cleared number fields', () => {
		it('base price leaves the form clean once typed into and cleared', async () => {
			await renderForm();
			await openSection('Purchase');

			await page.getByLabelText('Base price').fill('5');
			await expect.element(dirty()).toHaveTextContent('true');
			await page.getByLabelText('Base price').fill('');

			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('plate thickness leaves the form clean once typed into and cleared', async () => {
			await renderForm({ initial: keyboard });
			const thickness = part('Plate 1').getByLabelText('Thickness (mm)');

			await thickness.fill('5');
			await expect.element(dirty()).toHaveTextContent('true');
			await thickness.fill('');

			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('drops a cleared price rather than keeping the old value', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await page.getByLabelText('Base price').fill('');
			await submit('Save changes');

			expect(submitted(onSubmit)[0].purchase?.price).toBeNullable();
		});

		it('drops a cleared thickness rather than keeping the old value', async () => {
			const { onSubmit } = await renderForm({ initial: keyboard });

			await part('PCB 1').getByLabelText('Thickness (mm)').fill('');
			await submit('Save changes');

			expect(submitted(onSubmit)[0].pcbs?.[0].thickness).toBeNullable();
		});
	});

	it("doesn't submit on Enter in a text field", async () => {
		const { onSubmit } = await renderForm({ initial: keyboard });

		await page.getByLabelText('Name').click();
		await userEvent.keyboard('{Enter}');

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('locks the buttons while saving and shows a save error', async () => {
		await renderForm({ initial: keyboard, saving: true, error: 'kbdb said no' });

		await expect.element(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
		await expect.element(page.getByText('kbdb said no')).toBeInTheDocument();
	});

	it('cancels', async () => {
		const { onCancel } = await renderForm();

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(onCancel).toHaveBeenCalledOnce();
	});
});

function fileInput() {
	return page.elementLocator(document.querySelector('input[type="file"]')!);
}

function png(name: string) {
	return new File(['png'], name, { type: 'image/png' });
}

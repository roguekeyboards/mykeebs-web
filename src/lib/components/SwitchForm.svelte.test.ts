import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ImageStatus,
	ResponseError,
	Visibility,
	type Switch as SwitchModel,
	type SwitchInput
} from '@roguekeyboards/mykeebs-api-client';
import { lookupsApi } from '#lib/api/client.js';
import { todayDateInput } from '#lib/format.js';
import SwitchForm from './SwitchForm.svelte';
import FormWithDirty from './test-support/FormWithDirty.svelte';

vi.mock('#lib/api/client.js', () => ({ lookupsApi: { getLookup: vi.fn() } }));

const lookups: Record<string, string[]> = {
	switch_type: ['Linear', 'Tactile', 'Clicky'],
	switch_material: ['POM', 'Nylon', 'Polycarbonate'],
	switch_spring_material: ['Stainless steel', 'Gold-plated'],
	vendor: ['CannonKeys', 'NovelKeys'],
	order_status: ['Planned', 'Ordered', 'Delivered']
};

const sw: SwitchModel = {
	id: 'sw-1',
	brand: 'HMX',
	manufacturer: 'Huano',
	name: 'Aperol',
	type: 'Linear',
	pins: 5,
	factoryLubed: true,
	material: { topHousing: 'Polycarbonate', bottomHousing: 'Nylon', stem: 'Retired blend' },
	force: { actuation: 45, bottomOut: 55 },
	spring: { material: 'Stainless steel', preTravel: 1.8, totalTravel: 3.5 },
	purchase: {
		vendor: 'Group buy direct',
		price: 0.35,
		quantity: 90,
		orderDate: new Date('2026-02-01'),
		deliveryDate: new Date('2026-03-10'),
		orderStatus: 'Delivered'
	},
	notes: 'Creamy.',
	visibility: Visibility.Public,
	image: { url: 'https://img.example/aperol.png' }
};

async function renderForm(props: Partial<Parameters<typeof SwitchForm>[1]> = {}) {
	const mocks = { onSubmit: vi.fn(), onCancel: vi.fn() };
	await render(FormWithDirty, {
		form: SwitchForm,
		formProps: { saving: false, error: null, ...mocks, ...props }
	});
	return mocks;
}

async function submit(name = 'Add switch') {
	await page.getByRole('button', { name }).click();
}

function submitted(onSubmit: ReturnType<typeof vi.fn>): [SwitchInput, File | undefined] {
	expect(onSubmit).toHaveBeenCalledOnce();
	return onSubmit.mock.calls[0] as [SwitchInput, File | undefined];
}

async function openSection(section: string) {
	await page.getByText(new RegExp(`^${section} —`)).click();
}

async function fillRequired() {
	await page.getByLabelText('Brand', { exact: false }).fill('HMX');
	await page.getByLabelText('Name', { exact: false }).fill('Aperol');
	await page.getByLabelText('Type', { exact: false }).selectOptions('Linear');
}

const dirty = () => page.getByTestId('dirty');

describe('SwitchForm.svelte', () => {
	beforeEach(() => {
		vi.mocked(lookupsApi.getLookup).mockReset();
		vi.mocked(lookupsApi.getLookup).mockImplementation(
			async ({ category }) => ({ category, values: lookups[category] }) as never
		);
	});

	it('requires a brand, name, and type', async () => {
		const { onSubmit } = await renderForm();

		await page.getByLabelText('Brand', { exact: false }).fill('HMX');
		await page.getByLabelText('Name', { exact: false }).fill('Aperol');
		await submit();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Brand, name, and type are required.' }))
			.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('marks brand, name, and type required, and flags only the empty ones after a failed save', async () => {
		await renderForm();
		const type = page.getByLabelText('Type', { exact: false });
		await expect.element(page.getByLabelText('Brand', { exact: false })).toBeRequired();
		await expect.element(type).toBeRequired();

		await page.getByLabelText('Brand', { exact: false }).fill('HMX');
		await page.getByLabelText('Name', { exact: false }).fill('Aperol');
		await submit();

		await expect.element(type).toBeInvalid();
		await expect.element(type).toHaveAccessibleDescription('Brand, name, and type are required.');
		await expect.element(page.getByLabelText('Brand', { exact: false })).not.toBeInvalid();
		await expect.element(page.getByLabelText('Name', { exact: false })).not.toBeInvalid();
	});

	it('submits a minimal switch trimmed, private, and without empty sections', async () => {
		const { onSubmit } = await renderForm();

		await page.getByLabelText('Brand', { exact: false }).fill(' HMX ');
		await page.getByLabelText('Name', { exact: false }).fill(' Aperol ');
		await page.getByLabelText('Type', { exact: false }).selectOptions('Linear');
		await submit();

		expect(submitted(onSubmit)).toEqual([
			{
				brand: 'HMX',
				manufacturer: undefined,
				name: 'Aperol',
				type: 'Linear',
				pins: undefined,
				factoryLubed: undefined,
				material: undefined,
				force: undefined,
				spring: undefined,
				purchase: undefined,
				notes: undefined,
				visibility: Visibility.Private
			},
			undefined
		]);
	});

	it('nests every section that has a value into the submitted switch', async () => {
		const { onSubmit } = await renderForm();

		await fillRequired();
		await page.getByLabelText('Manufacturer').fill(' Huano ');
		await page.getByLabelText('Pins').selectOptions('3');
		await page.getByLabelText('Factory lubed').click();
		await page.getByRole('radio', { name: 'Signed in' }).click();

		await openSection('Construction');
		await page.getByLabelText('Stem', { exact: false }).selectOptions('POM');

		await openSection('Feel');
		await page.getByLabelText('Actuation force (g)').fill('45');
		await page.getByLabelText('Total travel (mm)').fill('3.5');

		await openSection('Purchase');
		await page.getByLabelText('Quantity').fill('90');

		await page.getByLabelText('Notes').fill(' Smooth ');
		await submit();

		const [input] = submitted(onSubmit);
		expect(input).toEqual({
			brand: 'HMX',
			manufacturer: 'Huano',
			name: 'Aperol',
			type: 'Linear',
			pins: 3,
			factoryLubed: true,
			material: { topHousing: undefined, bottomHousing: undefined, stem: 'POM' },
			force: { actuation: 45, bottomOut: undefined },
			spring: { material: undefined, preTravel: undefined, totalTravel: 3.5 },
			purchase: {
				vendor: undefined,
				price: undefined,
				orderDate: undefined,
				deliveryDate: undefined,
				orderStatus: undefined,
				quantity: 90
			},
			notes: 'Smooth',
			visibility: Visibility.Authenticated
		});
	});

	it('round-trips an existing switch untouched, including values the lookups no longer offer', async () => {
		const { onSubmit } = await renderForm({ initial: sw });

		await expect.element(page.getByRole('heading', { name: 'Edit switch' })).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Stem', { exact: false }))
			.toHaveValue('Retired blend');
		await submit('Save changes');

		const [input] = submitted(onSubmit);
		expect(input).toEqual({
			brand: 'HMX',
			manufacturer: 'Huano',
			name: 'Aperol',
			type: 'Linear',
			pins: 5,
			factoryLubed: true,
			material: { topHousing: 'Polycarbonate', bottomHousing: 'Nylon', stem: 'Retired blend' },
			force: { actuation: 45, bottomOut: 55 },
			spring: { material: 'Stainless steel', preTravel: 1.8, totalTravel: 3.5 },
			purchase: {
				vendor: 'Group buy direct',
				price: 0.35,
				orderDate: new Date('2026-02-01'),
				deliveryDate: new Date('2026-03-10'),
				orderStatus: 'Delivered',
				quantity: 90
			},
			notes: 'Creamy.',
			visibility: Visibility.Public
		});
	});

	it('sends factory lubed as absent rather than false once unticked', async () => {
		const { onSubmit } = await renderForm({ initial: sw });

		await page.getByLabelText('Factory lubed').click();
		await submit('Save changes');

		expect(submitted(onSubmit)[0].factoryLubed).toBeUndefined();
	});

	it('labels the pins select and the factory lubed checkbox separately', async () => {
		await renderForm();

		await expect.element(page.getByRole('combobox', { name: 'Pins' })).toBeInTheDocument();
		await expect.element(page.getByRole('checkbox', { name: 'Factory lubed' })).toBeInTheDocument();
	});

	it('ticks factory lubed when its text is clicked', async () => {
		await renderForm();

		await page.getByText('Factory lubed').click();

		await expect.element(page.getByRole('checkbox', { name: 'Factory lubed' })).toBeChecked();
	});

	it('summarizes each section and opens the ones an existing switch fills', async () => {
		await renderForm({ initial: sw });

		await expect.element(page.getByText('— Polycarbonate · Nylon · Retired blend')).toBeVisible();
		await expect.element(page.getByText('— 45g actuation · Stainless steel')).toBeVisible();
		await expect.element(page.getByText('— Group buy direct · Delivered')).toBeVisible();
		await expect.element(page.getByLabelText('Pre-travel (mm)')).toBeVisible();
	});

	it('opens Feel for a switch with only a spring value', async () => {
		await renderForm({ initial: { ...sw, force: undefined, spring: { preTravel: 2 } } });

		await expect.element(page.getByLabelText('Pre-travel (mm)')).toBeVisible();
	});

	it('starts with every section collapsed for a new switch', async () => {
		await renderForm();

		await expect.element(page.getByText('— Not set').nth(2)).toBeInTheDocument();
		await expect.element(page.getByLabelText('Stem', { exact: false })).not.toBeVisible();
	});

	describe('order dates', () => {
		it('asks for an order date, defaulting to today, once ordered', async () => {
			await renderForm();
			await openSection('Purchase');

			await page.getByLabelText('Order status', { exact: false }).selectOptions('Ordered');

			await expect.element(page.getByLabelText('Order date')).toHaveValue(todayDateInput());
			await expect.element(page.getByLabelText('Delivery date')).not.toBeInTheDocument();
		});

		it('asks for a delivery date, defaulting to today, once delivered', async () => {
			await renderForm();
			await openSection('Purchase');

			await page.getByLabelText('Order status', { exact: false }).selectOptions('Delivered');

			await expect.element(page.getByLabelText('Delivery date')).toHaveValue(todayDateInput());
		});

		it('drops dates the new status would not have', async () => {
			const { onSubmit } = await renderForm({ initial: sw });

			await page.getByLabelText('Order status', { exact: false }).selectOptions('Planned');
			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.purchase?.orderDate).toBeUndefined();
			expect(input.purchase?.deliveryDate).toBeUndefined();
		});

		it('leaves existing dates alone on open, even if the status would not set them', async () => {
			const { onSubmit } = await renderForm({
				initial: { ...sw, purchase: { ...sw.purchase, orderStatus: 'Planned' } }
			});

			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.purchase?.orderDate).toEqual(new Date('2026-02-01'));
			expect(input.purchase?.deliveryDate).toEqual(new Date('2026-03-10'));
		});
	});

	describe('dirty', () => {
		it('starts clean for an existing switch', async () => {
			await renderForm({ initial: sw });

			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('turns dirty on an edit and clean again when it is undone', async () => {
			await renderForm({ initial: sw });

			await page.getByLabelText('Pins').selectOptions('3');
			await expect.element(dirty()).toHaveTextContent('true');

			await page.getByLabelText('Pins').selectOptions('5');
			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('turns dirty when a photo is staged', async () => {
			await renderForm();

			await userEvent.upload(fileInput(), png('a.png'));

			await expect.element(dirty()).toHaveTextContent('true');
		});
	});

	describe('image on a new switch', () => {
		it('stages a picked photo and submits it with the switch', async () => {
			const { onSubmit } = await renderForm();
			const a = png('a.png');

			await userEvent.upload(fileInput(), a);
			await expect.element(page.getByAltText('Selected switch')).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
			await fillRequired();
			await submit();

			expect(submitted(onSubmit)[1]?.name).toBe('a.png');
		});

		it('replaces the staged photo when another is picked', async () => {
			const { onSubmit } = await renderForm();
			const b = png('b.png');

			await userEvent.upload(fileInput(), png('a.png'));
			await userEvent.upload(fileInput(), b);
			await fillRequired();
			await submit();

			expect(submitted(onSubmit)[1]?.name).toBe('b.png');
		});

		it('drops the staged photo when it is removed', async () => {
			const { onSubmit } = await renderForm();

			await userEvent.upload(fileInput(), png('a.png'));
			await page.getByRole('button', { name: 'Remove' }).click();
			await expect.element(page.getByAltText('Selected switch')).not.toBeInTheDocument();
			await fillRequired();
			await submit();

			expect(submitted(onSubmit)[1]).toBeUndefined();
		});
	});

	describe('image on an existing switch', () => {
		it('uploads a picked photo straight away', async () => {
			const onImageUpload = vi.fn(async () => {});
			await renderForm({ initial: sw, onImageUpload });
			const a = png('a.png');

			await userEvent.upload(fileInput(), a);

			await vi.waitFor(() => expect(onImageUpload).toHaveBeenCalledWith(a));
		});

		it('says so when an upload fails', async () => {
			await renderForm({ initial: sw, onImageUpload: vi.fn().mockRejectedValue(new Error('x')) });

			await userEvent.upload(fileInput(), png('a.png'));

			await expect
				.element(
					page.getByRole('alert').filter({ hasText: "That photo wasn't added. Add it again." })
				)
				.toBeInTheDocument();
		});

		it('says uploads are unavailable when kbdb refuses with a 429', async () => {
			await renderForm({
				initial: sw,
				onImageUpload: vi.fn().mockRejectedValue(
					new ResponseError(
						new Response(null, {
							status: 429,
							headers: { 'Content-Type': 'application/problem+json' }
						})
					)
				)
			});

			await userEvent.upload(fileInput(), png('a.png'));

			await expect
				.element(
					page.getByRole('alert').filter({ hasText: 'Uploads unavailable, try again later.' })
				)
				.toBeInTheDocument();
		});

		it('marks a photo that is pending review', async () => {
			await renderForm({
				initial: { ...sw, image: { url: 'https://img.example/s.png', status: ImageStatus.Pending } }
			});

			await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
		});

		it('shows a rejected photo by its reason, and offers to remove or replace it', async () => {
			const onImageRemove = vi.fn(async () => {});
			await renderForm({
				initial: { ...sw, image: { status: ImageStatus.Rejected, rejectionReason: 'Violence' } },
				onImageRemove
			});

			await expect
				.element(page.getByRole('img', { name: 'Photo removed by moderation: Violence' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
			await page.getByRole('button', { name: 'Remove' }).click();
			expect(onImageRemove).toHaveBeenCalled();
		});

		it('removes the photo', async () => {
			const onImageRemove = vi.fn(async () => {});
			await renderForm({ initial: sw, onImageRemove });

			await page.getByRole('button', { name: 'Remove' }).click();

			expect(onImageRemove).toHaveBeenCalledOnce();
		});

		it('says so when removing fails', async () => {
			await renderForm({ initial: sw, onImageRemove: vi.fn().mockRejectedValue(new Error('x')) });

			await page.getByRole('button', { name: 'Remove' }).click();

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Could not remove the image.' }))
				.toBeInTheDocument();
		});
	});

	describe('cleared number fields', () => {
		const withoutNumbers: SwitchModel = {
			...sw,
			force: undefined,
			spring: { material: 'Stainless steel' },
			purchase: { vendor: 'NovelKeys' }
		};

		it.each([
			'Actuation force (g)',
			'Bottom-out force (g)',
			'Pre-travel (mm)',
			'Total travel (mm)',
			'Price',
			'Quantity'
		])('%s leaves the form clean once typed into and cleared', async (label) => {
			await renderForm({ initial: withoutNumbers });

			await page.getByLabelText(label).fill('5');
			await expect.element(dirty()).toHaveTextContent('true');
			await page.getByLabelText(label).fill('');

			await expect.element(dirty()).toHaveTextContent('false');
		});

		it('drops cleared numbers rather than keeping the old values', async () => {
			const { onSubmit } = await renderForm({ initial: sw });

			await page.getByLabelText('Actuation force (g)').fill('');
			await page.getByLabelText('Pre-travel (mm)').fill('');
			await page.getByLabelText('Quantity').fill('');
			await submit('Save changes');

			const [input] = submitted(onSubmit);
			expect(input.force?.actuation).toBeNullable();
			expect(input.spring?.preTravel).toBeNullable();
			expect(input.purchase?.quantity).toBeNullable();
		});
	});

	it("doesn't submit on Enter in a text field", async () => {
		const { onSubmit } = await renderForm({ initial: sw });

		await page.getByLabelText('Name', { exact: false }).click();
		await userEvent.keyboard('{Enter}');

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('locks the buttons while saving and shows a save error', async () => {
		await renderForm({ initial: sw, saving: true, error: 'kbdb said no' });

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

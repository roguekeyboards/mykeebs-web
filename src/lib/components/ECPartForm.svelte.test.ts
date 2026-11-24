import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ECPartType,
	Visibility,
	type ECPart,
	type ECPartInput
} from '@roguekeyboards/mykeebs-api-client';
import { lookupsApi } from '#lib/api/client.js';
import ECPartForm from './ECPartForm.svelte';
import FormWithDirty from './test-support/FormWithDirty.svelte';

vi.mock('#lib/api/client.js', () => ({ lookupsApi: { getLookup: vi.fn() } }));

const lookups: Record<string, string[]> = {
	ec_dome_material: ['Silicone', 'Rubber'],
	switch_material: ['POM', 'Nylon'],
	switch_spring_material: ['Stainless steel'],
	ec_ring_material: ['Rubber', 'Silicone'],
	vendor: ['Deskeys', 'Keebwerk'],
	order_status: ['Planned', 'Ordered', 'Delivered']
};

const sliders: ECPart = {
	id: 'ec-1',
	brand: 'Keebwerk',
	name: 'MX sliders',
	partType: ECPartType.Sliders,
	sliders: { size: '2U', stem: 'MX', material: 'Retired blend' },
	purchases: [{ vendor: 'Keebwerk', price: 30, quantity: 90, orderStatus: 'Planned' }],
	notes: 'Smooth.',
	visibility: Visibility.Public
};

async function renderForm(props: Partial<Parameters<typeof ECPartForm>[1]> = {}) {
	const mocks = { onSubmit: vi.fn(), onCancel: vi.fn() };
	await render(FormWithDirty, {
		form: ECPartForm,
		formProps: { saving: false, error: null, ...mocks, ...props }
	});
	return mocks;
}

async function submit(name = 'Add EC part') {
	await page.getByRole('button', { name }).click();
}

function submitted(onSubmit: ReturnType<typeof vi.fn>): [ECPartInput, File | undefined] {
	expect(onSubmit).toHaveBeenCalledOnce();
	return onSubmit.mock.calls[0] as [ECPartInput, File | undefined];
}

async function fillRequired(partType = 'Domes') {
	await page.getByLabelText('Brand', { exact: false }).fill(' Deskeys ');
	await page.getByLabelText('Name', { exact: false }).fill(' Silicone domes ');
	await page.getByLabelText('Part type', { exact: false }).selectOptions(partType);
}

const dirty = () => page.getByTestId('dirty');

describe('ECPartForm.svelte', () => {
	beforeEach(() => {
		vi.mocked(lookupsApi.getLookup).mockReset();
		vi.mocked(lookupsApi.getLookup).mockImplementation(
			async ({ category }) => ({ category, values: lookups[category] }) as never
		);
	});

	it('requires a brand, name, and part type, flagging the empty ones', async () => {
		const { onSubmit } = await renderForm();
		const partType = page.getByLabelText('Part type', { exact: false });
		await expect.element(partType).toBeRequired();

		await page.getByLabelText('Brand', { exact: false }).fill('Deskeys');
		await page.getByLabelText('Name', { exact: false }).fill('Domes');
		await submit();

		await expect.element(partType).toBeInvalid();
		await expect
			.element(partType)
			.toHaveAccessibleDescription('Brand, name, and part type are required.');
		await expect.element(page.getByLabelText('Brand', { exact: false })).not.toBeInvalid();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('shows no part fields until a part type is chosen', async () => {
		await renderForm();

		await expect.element(page.getByLabelText('Material', { exact: false })).not.toBeInTheDocument();
		await page.getByLabelText('Part type', { exact: false }).selectOptions('Silencing rings');
		await expect.element(page.getByLabelText('Thickness (mm)')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Weight (g)')).not.toBeInTheDocument();
	});

	it('submits a part trimmed, private, with only its own fields', async () => {
		const { onSubmit } = await renderForm();

		await fillRequired();
		await page.getByLabelText('Weight (g)').fill('45');
		await page.getByLabelText('Material', { exact: false }).selectOptions('Silicone');
		await page.getByLabelText('Color').fill(' Red ');
		await submit();

		expect(submitted(onSubmit)).toEqual([
			{
				brand: 'Deskeys',
				name: 'Silicone domes',
				partType: 'domes',
				domes: { weight: 45, material: 'Silicone', color: 'Red' },
				purchases: [],
				notes: undefined,
				visibility: Visibility.Private
			},
			undefined
		]);
	});

	it("drops the fields of a part type that's no longer chosen", async () => {
		const { onSubmit } = await renderForm();

		await fillRequired();
		await page.getByLabelText('Weight (g)').fill('45');
		await page.getByLabelText('Part type', { exact: false }).selectOptions('Silencing rings');
		await page.getByLabelText('Thickness (mm)').fill('0.3');
		await submit();

		const [input] = submitted(onSubmit);
		expect(input.domes).toBeUndefined();
		expect(input).toMatchObject({
			partType: 'rings',
			rings: { material: undefined, thickness: 0.3 }
		});
	});

	it('puts the quantity into the purchase, even with nothing else bought', async () => {
		const { onSubmit } = await renderForm();

		await fillRequired('Springs');
		await page.getByText(/^Purchase —/).click();
		await page.getByLabelText('Quantity').fill('110');
		await submit();

		expect(submitted(onSubmit)[0].purchases).toEqual([{ quantity: 110 }]);
	});

	it('round-trips an existing part untouched, including values the lookups no longer offer', async () => {
		const { onSubmit } = await renderForm({ initial: sliders });

		await expect.element(page.getByRole('heading', { name: 'Edit EC part' })).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Material', { exact: false }))
			.toHaveValue('Retired blend');
		await expect.element(dirty()).toHaveTextContent('false');
		await submit('Save changes');

		expect(submitted(onSubmit)[0]).toEqual({
			brand: 'Keebwerk',
			name: 'MX sliders',
			partType: 'sliders',
			sliders: { size: '2U', stem: 'MX', material: 'Retired blend' },
			purchases: [
				{
					vendor: 'Keebwerk',
					price: 30,
					orderDate: undefined,
					deliveryDate: undefined,
					orderStatus: 'Planned',
					quantity: 90
				}
			],
			notes: 'Smooth.',
			visibility: Visibility.Public
		});
	});

	it('is dirty only while a field differs from the saved part', async () => {
		await renderForm({ initial: sliders });

		await page.getByLabelText('Stem', { exact: false }).selectOptions('OEM');
		await expect.element(dirty()).toHaveTextContent('true');
		await page.getByLabelText('Stem', { exact: false }).selectOptions('MX');
		await expect.element(dirty()).toHaveTextContent('false');

		await page.getByLabelText('Quantity').fill('');
		await expect.element(dirty()).toHaveTextContent('true');
	});

	describe('several purchases', () => {
		const restocked: ECPart = {
			...sliders,
			purchases: [
				{ vendor: 'Keebwerk', price: 30, quantity: 90, orderStatus: 'Planned' },
				{ vendor: 'Deskeys', price: 12, quantity: 20, orderStatus: 'Ordered' }
			]
		};

		it('edits each purchase in its own group and sends them all', async () => {
			const { onSubmit } = await renderForm({ initial: restocked });

			const second = page.getByRole('group', { name: 'Purchase 2' });
			await expect.element(page.getByText('— 2 purchases')).toBeVisible();
			await expect
				.element(second.getByLabelText('Vendor', { exact: false }))
				.toHaveValue('Deskeys');
			await second.getByLabelText('Quantity').fill('25');
			await submit('Save changes');

			expect(submitted(onSubmit)[0].purchases).toEqual([
				{ vendor: 'Keebwerk', price: 30, quantity: 90, orderStatus: 'Planned' },
				{ vendor: 'Deskeys', price: 12, quantity: 25, orderStatus: 'Ordered' }
			]);
		});

		it('adds a purchase for a restock', async () => {
			const { onSubmit } = await renderForm({ initial: sliders });

			await page.getByRole('button', { name: '+ Add purchase' }).click();
			await expect.element(dirty()).toHaveTextContent('false');
			const second = page.getByRole('group', { name: 'Purchase 2' });
			await second.getByLabelText('Vendor', { exact: false }).selectOptions('Deskeys');
			await second.getByLabelText('Quantity').fill('20');
			await expect.element(dirty()).toHaveTextContent('true');
			await submit('Save changes');

			expect(submitted(onSubmit)[0].purchases).toEqual([
				{ vendor: 'Keebwerk', price: 30, quantity: 90, orderStatus: 'Planned' },
				{ vendor: 'Deskeys', quantity: 20 }
			]);
		});

		it('removes a purchase', async () => {
			const { onSubmit } = await renderForm({ initial: restocked });

			await page.getByRole('button', { name: 'Remove purchase 1' }).click();
			await expect.element(dirty()).toHaveTextContent('true');
			await expect
				.element(page.getByRole('button', { name: /^Remove purchase/ }))
				.not.toBeInTheDocument();
			await submit('Save changes');

			expect(submitted(onSubmit)[0].purchases).toEqual([
				{ vendor: 'Deskeys', price: 12, quantity: 20, orderStatus: 'Ordered' }
			]);
		});
	});

	it('stages a photo for a new part and counts it as an edit', async () => {
		const { onSubmit } = await renderForm();
		const photo = new File(['x'], 'domes.png', { type: 'image/png' });

		await userEvent.upload(
			page.elementLocator(document.querySelector('input[type="file"]')!),
			photo
		);
		await expect.element(dirty()).toHaveTextContent('true');
		await fillRequired();
		await submit();

		expect(submitted(onSubmit)[1]?.name).toBe('domes.png');
	});
});

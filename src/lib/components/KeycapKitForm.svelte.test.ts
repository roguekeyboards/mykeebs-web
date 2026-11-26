import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ImageStatus,
	ResponseError,
	type KeycapKit,
	type KeycapKitInput
} from '@roguekeyboards/mykeebs-api-client';
import { ImageTooLargeError } from '#lib/image-errors.js';
import { lookupsApi } from '#lib/api/client.js';
import { quarterOptions } from '#lib/estimated-delivery.js';
import { todayDateInput } from '#lib/format.js';
import KeycapKitForm from './KeycapKitForm.svelte';
import FormWithDirty from './test-support/FormWithDirty.svelte';

vi.mock('#lib/api/client.js', () => ({ lookupsApi: { getLookup: vi.fn() } }));

const lookups: Record<string, string[]> = {
	vendor: ['NovelKeys'],
	order_status: ['Planned', 'Ordered', 'Shipped', 'Delivered', 'Cancelled']
};

beforeEach(() => {
	vi.mocked(lookupsApi.getLookup).mockImplementation(
		async ({ category }) => ({ category, values: lookups[category] }) as never
	);
});

const kit: KeycapKit = { kitId: 'kit-1', name: 'Base' };

async function submitted(isPrimary: boolean, toggle: boolean): Promise<KeycapKitInput> {
	const onSubmit = vi.fn();
	await render(KeycapKitForm, {
		initial: kit,
		isPrimary,
		saving: false,
		error: null,
		onSubmit,
		onCancel: () => {}
	});
	if (toggle) await page.getByLabelText('Primary kit for this set').click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	expect(onSubmit).toHaveBeenCalledOnce();
	return onSubmit.mock.calls[0][0];
}

describe('KeycapKitForm.svelte', () => {
	it("starts ticked for the set's primary kit", async () => {
		await render(KeycapKitForm, {
			initial: kit,
			isPrimary: true,
			saving: false,
			error: null,
			onSubmit: () => {},
			onCancel: () => {}
		});
		await expect.element(page.getByLabelText('Primary kit for this set')).toBeChecked();
	});

	it('leaves primary out when an untouched kit is saved', async () => {
		const input = await submitted(false, false);
		expect(input.primary).toBeUndefined();
	});

	it('sends true when the box is ticked', async () => {
		const input = await submitted(false, true);
		expect(input.primary).toBe(true);
	});

	it('sends false when the primary kit is unticked', async () => {
		const input = await submitted(true, true);
		expect(input.primary).toBe(false);
	});
});

describe('KeycapKitForm.svelte cleared price', () => {
	async function renderKit(initial: KeycapKit) {
		const onSubmit = vi.fn();
		await render(FormWithDirty, {
			form: KeycapKitForm,
			formProps: { initial, saving: false, error: null, onSubmit, onCancel: () => {} }
		});
		return onSubmit;
	}

	it('leaves the form clean once the price is typed into and cleared', async () => {
		await renderKit(kit);
		const dirty = page.getByTestId('dirty');

		await page.getByLabelText('Price').fill('5');
		await expect.element(dirty).toHaveTextContent('true');
		await page.getByLabelText('Price').fill('');

		await expect.element(dirty).toHaveTextContent('false');
	});

	it('drops a cleared price rather than keeping the old value', async () => {
		const onSubmit = await renderKit({ ...kit, purchase: { vendor: 'NovelKeys', price: 120 } });

		await page.getByLabelText('Price').fill('');
		await page.getByRole('button', { name: 'Save changes' }).click();

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onSubmit.mock.calls[0][0].purchase?.price).toBeNullable();
	});

	it('marks the name required, and flags it after a failed save', async () => {
		await render(KeycapKitForm, {
			saving: false,
			error: null,
			onSubmit: vi.fn(),
			onCancel: () => {}
		});
		const name = page.getByLabelText('Name', { exact: false });
		await expect.element(name).toBeRequired();

		await page.getByRole('button', { name: 'Add kit' }).click();

		await expect.element(name).toBeInvalid();
		await expect.element(name).toHaveAccessibleDescription('Name is required.');
	});
});

describe('KeycapKitForm.svelte image moderation', () => {
	async function renderKit(initial: KeycapKit, props: Record<string, unknown> = {}) {
		await render(KeycapKitForm, {
			initial,
			isPrimary: false,
			saving: false,
			error: null,
			onSubmit: () => {},
			onCancel: () => {},
			...props
		});
	}

	it('marks a photo that is pending review', async () => {
		await renderKit({
			...kit,
			image: { url: 'https://img.example/k.png', status: ImageStatus.Pending }
		});

		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
	});

	it('shows a rejected photo by its reason, and offers to remove it', async () => {
		const onImageRemove = vi.fn(async () => {});
		await renderKit(
			{ ...kit, image: { status: ImageStatus.Rejected, rejectionReason: 'Explicit' } },
			{ onImageRemove }
		);

		await expect
			.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Remove' }).click();
		expect(onImageRemove).toHaveBeenCalled();
	});

	it('holds Save until the photo finishes uploading', async () => {
		let finish = () => {};
		const onImageUpload = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		await renderKit(kit, { onImageUpload });
		const save = page.getByRole('button', { name: 'Save changes' });

		await userEvent.upload(
			page.elementLocator(document.querySelector('input[type="file"]')!),
			new File(['png'], 'a.png', { type: 'image/png' })
		);
		await expect.element(save).toBeDisabled();

		finish();
		await expect.element(save).toBeEnabled();
	});

	it('says uploads are unavailable when mykeebs-api refuses with a 429', async () => {
		await renderKit(kit, {
			onImageUpload: vi.fn().mockRejectedValue(
				new ResponseError(
					new Response(null, {
						status: 429,
						headers: { 'Content-Type': 'application/problem+json' }
					})
				)
			)
		});

		await userEvent.upload(
			page.elementLocator(document.querySelector('input[type="file"]')!),
			new File(['png'], 'a.png', { type: 'image/png' })
		);

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Uploads unavailable, try again later.' }))
			.toBeInTheDocument();
	});

	it('asks for a different photo when one is too large to upload', async () => {
		await renderKit(kit, { onImageUpload: vi.fn().mockRejectedValue(new ImageTooLargeError()) });

		await userEvent.upload(
			page.elementLocator(document.querySelector('input[type="file"]')!),
			new File(['png'], 'a.png', { type: 'image/png' })
		);

		await expect
			.element(
				page.getByRole('alert').filter({
					hasText:
						"That photo wasn't added. It's too detailed to fit under 1.5 MB. Add a different one."
				})
			)
			.toBeInTheDocument();
	});
});

describe('KeycapKitForm.svelte estimated delivery', () => {
	async function renderKit(initial?: KeycapKit) {
		const onSubmit = vi.fn();
		await render(FormWithDirty, {
			form: KeycapKitForm,
			formProps: { initial, saving: false, error: null, onSubmit, onCancel: () => {} }
		});
		return onSubmit;
	}

	const status = () => page.getByLabelText(/^Order status/);
	const estimate = () => page.getByLabelText(/^Estimated delivery(?! date)/);
	const estimateDate = () => page.getByLabelText('Estimated delivery date');

	async function save(onSubmit: ReturnType<typeof vi.fn>) {
		await page.getByRole('button', { name: 'Save changes' }).click();
		expect(onSubmit).toHaveBeenCalledOnce();
		return (onSubmit.mock.calls[0][0] as KeycapKitInput).purchase;
	}

	it('offers this quarter and the five after it once the kit is ordered', async () => {
		await renderKit(kit);
		await expect.element(estimate()).not.toBeInTheDocument();

		await status().selectOptions('Ordered');

		const options = [...(estimate().element() as HTMLSelectElement).options].map((o) => o.text);
		expect(options).toEqual([
			'—',
			...quarterOptions(todayDateInput()).map((q) => q.label),
			'Specific date…'
		]);
		expect(options).toHaveLength(8);
	});

	it("saves a quarter as the quarter's last day", async () => {
		const onSubmit = await renderKit(kit);
		const next = quarterOptions(todayDateInput())[1];

		await status().selectOptions('Ordered');
		await estimate().selectOptions(next.label);

		expect((await save(onSubmit))?.estimatedDeliveryDate).toEqual(new Date(next.value));
	});

	it('saves a specific date, starting from the quarter already chosen', async () => {
		const onSubmit = await renderKit(kit);

		await status().selectOptions('Ordered');
		const next = quarterOptions(todayDateInput())[1];
		await estimate().selectOptions(next.label);
		await estimate().selectOptions('Specific date…');
		await expect.element(estimateDate()).toHaveValue(next.value);
		await estimateDate().fill('2031-02-14');

		expect((await save(onSubmit))?.estimatedDeliveryDate).toEqual(new Date('2031-02-14'));
	});

	it('opens a saved quarter end as its quarter, even one already past', async () => {
		await renderKit({
			...kit,
			purchase: { orderStatus: 'Shipped', estimatedDeliveryDate: new Date('2020-06-30') }
		});

		await expect.element(estimate()).toHaveDisplayValue('Q2 2020');
		await expect.element(estimateDate()).not.toBeInTheDocument();
		await expect.element(page.getByTestId('dirty')).toHaveTextContent('false');
	});

	it('opens any other saved date as a specific date', async () => {
		await renderKit({
			...kit,
			purchase: { orderStatus: 'Ordered', estimatedDeliveryDate: new Date('2027-02-14') }
		});

		await expect.element(estimate()).toHaveDisplayValue('Specific date…');
		await expect.element(estimateDate()).toHaveValue('2027-02-14');
	});

	it.each(['Delivered', 'Cancelled'])('drops the estimate once the kit is %s', async (next) => {
		const onSubmit = await renderKit({
			...kit,
			purchase: { orderStatus: 'Ordered', estimatedDeliveryDate: new Date('2027-03-31') }
		});

		await status().selectOptions(next);
		await expect.element(estimate()).not.toBeInTheDocument();

		expect((await save(onSubmit))?.estimatedDeliveryDate).toBeUndefined();
	});

	it('refuses to save an estimate before the order date', async () => {
		const onSubmit = vi.fn();
		await render(KeycapKitForm, {
			initial: {
				...kit,
				purchase: { orderStatus: 'Ordered', orderDate: new Date('2030-11-01') }
			},
			saving: false,
			error: null,
			onSubmit,
			onCancel: () => {}
		});

		await estimate().selectOptions('Specific date…');
		await estimateDate().fill('2030-10-15');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent("Estimated delivery can't be before the order date.");
		expect(onSubmit).not.toHaveBeenCalled();
	});
});

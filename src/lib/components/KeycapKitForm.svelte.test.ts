import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	ImageStatus,
	ResponseError,
	type KeycapKit,
	type KeycapKitInput
} from '@rogueserenity/kbdb-api-client';
import KeycapKitForm from './KeycapKitForm.svelte';
import FormWithDirty from './test-support/FormWithDirty.svelte';

const kit: KeycapKit = { kitId: 'kit-1', name: 'Base' };

async function submitted(isPrimary: boolean, toggle: boolean): Promise<KeycapKitInput> {
	const onSubmit = vi.fn();
	render(KeycapKitForm, {
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
		render(KeycapKitForm, {
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
	function renderKit(initial: KeycapKit) {
		const onSubmit = vi.fn();
		render(FormWithDirty, {
			form: KeycapKitForm,
			formProps: { initial, saving: false, error: null, onSubmit, onCancel: () => {} }
		});
		return onSubmit;
	}

	it('leaves the form clean once the price is typed into and cleared', async () => {
		renderKit(kit);
		const dirty = page.getByTestId('dirty');

		await page.getByLabelText('Price').fill('5');
		await expect.element(dirty).toHaveTextContent('true');
		await page.getByLabelText('Price').fill('');

		await expect.element(dirty).toHaveTextContent('false');
	});

	it('drops a cleared price rather than keeping the old value', async () => {
		const onSubmit = renderKit({ ...kit, purchase: { vendor: 'NovelKeys', price: 120 } });

		await page.getByLabelText('Price').fill('');
		await page.getByRole('button', { name: 'Save changes' }).click();

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onSubmit.mock.calls[0][0].purchase?.price).toBeNullable();
	});

	it('marks the name required, and flags it after a failed save', async () => {
		render(KeycapKitForm, { saving: false, error: null, onSubmit: vi.fn(), onCancel: () => {} });
		const name = page.getByLabelText('Name');
		await expect.element(name).toBeRequired();

		await page.getByRole('button', { name: 'Add kit' }).click();

		await expect.element(name).toBeInvalid();
		await expect.element(name).toHaveAccessibleDescription('Name is required.');
	});
});

describe('KeycapKitForm.svelte image moderation', () => {
	function renderKit(initial: KeycapKit, props: Record<string, unknown> = {}) {
		render(KeycapKitForm, {
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
		renderKit({ ...kit, image: { url: 'https://img.example/k.png', status: ImageStatus.Pending } });

		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
	});

	it('shows a rejected photo by its reason, and offers to remove it', async () => {
		const onImageRemove = vi.fn(async () => {});
		renderKit(
			{ ...kit, image: { status: ImageStatus.Rejected, rejectionReason: 'Explicit' } },
			{ onImageRemove }
		);

		await expect
			.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		expect(onImageRemove).toHaveBeenCalled();
	});

	it('says uploads are unavailable when kbdb refuses with a 429', async () => {
		renderKit(kit, {
			onImageUpload: vi
				.fn()
				.mockRejectedValue(new ResponseError(new Response(null, { status: 429 })))
		});

		await userEvent.upload(
			page.elementLocator(document.querySelector('input[type="file"]')!),
			new File(['png'], 'a.png', { type: 'image/png' })
		);

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'Uploads unavailable, try again later.' }))
			.toBeInTheDocument();
	});
});

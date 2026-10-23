import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ImageStatus, type Build } from '@rogueserenity/kbdb-api-client';
import BuildDetails from './BuildDetails.svelte';

const build: Build = {
	id: 'b',
	keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
	switches: [{ _switch: { id: 'sw', brand: 'HMX', name: 'Aperol', type: 'Linear' }, count: 70 }],
	keycapSets: [
		{
			id: 'set-w',
			brand: 'GMK',
			name: 'WoB',
			kits: [{ kitId: 'base', name: 'Base' }]
		},
		{
			id: 'set-o',
			brand: 'GMK',
			name: 'Olivia',
			kits: [
				{ kitId: 'base', name: 'Base' },
				{ kitId: 'novelties', name: 'Novelties' }
			]
		}
	]
};

async function renderDetails() {
	const props = {
		build,
		onKeyboardClick: vi.fn(),
		onSwitchClick: vi.fn(),
		onKeycapKitClick: vi.fn(),
		onImageClick: vi.fn(),
		showPrice: true
	};
	await render(BuildDetails, props);
	return props;
}

describe('BuildDetails.svelte', () => {
	it("lists each set's kits, with sets in name order", async () => {
		await renderDetails();

		const kits = page.getByRole('listitem').filter({ hasText: '—' });
		await expect.element(kits.nth(0)).toMatchTextContent('Olivia — Base');
		await expect.element(kits.nth(1)).toMatchTextContent('Olivia — Novelties');
		await expect.element(kits.nth(2)).toMatchTextContent('WoB — Base');
	});

	it('opens a kit by its set and kit id', async () => {
		const { onKeycapKitClick } = await renderDetails();

		await page.getByRole('button', { name: 'Olivia — Novelties' }).click();

		expect(onKeycapKitClick).toHaveBeenCalledWith('set-o', 'novelties');
	});

	it('opens the keyboard and switches by id', async () => {
		const { onKeyboardClick, onSwitchClick } = await renderDetails();

		await page.getByRole('button', { name: 'Manta' }).click();
		await page.getByRole('button', { name: '70x Aperol (HMX)' }).click();

		expect(onKeyboardClick).toHaveBeenCalledWith('kb');
		expect(onSwitchClick).toHaveBeenCalledWith('sw');
	});

	it('describes the plate and PCB the build uses', async () => {
		await render(BuildDetails, {
			build: {
				...build,
				plate: { id: 'p', material: 'POM', color: 'Black', thickness: 1.5 },
				pcb: { id: 'c', assembly: 'Hotswap', firmware: 'VIA', connectivity: 'Wired' }
			},
			onKeyboardClick: vi.fn(),
			onSwitchClick: vi.fn(),
			onKeycapKitClick: vi.fn(),
			onImageClick: vi.fn(),
			showPrice: true
		});

		await expect.element(page.getByText('POM · Black · 1.5mm')).toBeInTheDocument();
		await expect.element(page.getByText('Hotswap · VIA · Wired')).toBeInTheDocument();
	});
});

describe('BuildDetails.svelte image moderation', () => {
	it('shows a rejected image by its reason and opens the gallery among the viewable ones', async () => {
		const onImageClick = vi.fn();
		await render(BuildDetails, {
			build: {
				...build,
				images: [
					{ imageId: 'rejected', status: ImageStatus.Rejected, rejectionReason: 'Explicit' },
					{ imageId: 'pending', url: 'https://img.example/p.png', status: ImageStatus.Pending }
				]
			},
			onKeyboardClick: vi.fn(),
			onSwitchClick: vi.fn(),
			onKeycapKitClick: vi.fn(),
			onImageClick,
			showPrice: true
		});

		await expect
			.element(page.getByRole('img', { name: 'Photo removed by moderation: Explicit' }))
			.toBeInTheDocument();
		await expect.element(page.getByTitle('Pending review')).toBeInTheDocument();
		await page.getByRole('button', { name: 'View full size image' }).click();
		expect(onImageClick).toHaveBeenCalledWith(0);
	});
});

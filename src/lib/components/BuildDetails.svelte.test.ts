import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Build } from '@rogueserenity/kbdb-api-client';
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

function renderDetails() {
	const props = {
		build,
		onKeyboardClick: vi.fn(),
		onSwitchClick: vi.fn(),
		onKeycapKitClick: vi.fn(),
		onImageClick: vi.fn(),
		showPrice: true
	};
	render(BuildDetails, props);
	return props;
}

describe('BuildDetails.svelte', () => {
	it("lists each set's kits, with sets in name order", async () => {
		renderDetails();

		const kits = page.getByRole('listitem').filter({ hasText: '—' });
		await expect.element(kits.nth(0)).toHaveTextContent('Olivia — Base');
		await expect.element(kits.nth(1)).toHaveTextContent('Olivia — Novelties');
		await expect.element(kits.nth(2)).toHaveTextContent('WoB — Base');
	});

	it('opens a kit by its set and kit id', async () => {
		const { onKeycapKitClick } = renderDetails();

		await page.getByRole('button', { name: 'Olivia — Novelties' }).click();

		expect(onKeycapKitClick).toHaveBeenCalledWith('set-o', 'novelties');
	});

	it('opens the keyboard and switches by id', async () => {
		const { onKeyboardClick, onSwitchClick } = renderDetails();

		await page.getByRole('button', { name: 'Manta' }).click();
		await page.getByRole('button', { name: '70x Aperol (HMX)' }).click();

		expect(onKeyboardClick).toHaveBeenCalledWith('kb');
		expect(onSwitchClick).toHaveBeenCalledWith('sw');
	});

	it('describes the plate and PCB the build uses', async () => {
		render(BuildDetails, {
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

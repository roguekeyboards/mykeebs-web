import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Visibility } from '@rogueserenity/kbdb-api-client';
import KeyboardDetails from './KeyboardDetails.svelte';
import SwitchDetails from './SwitchDetails.svelte';
import KeycapSetDetails from './KeycapSetDetails.svelte';
import BuildDetails from './BuildDetails.svelte';
import '../../routes/layout.css';

const purchase = {
	vendor: 'KBDfans',
	price: 125,
	currency: 'USD',
	orderStatus: 'Delivered',
	orderDate: new Date('2026-05-17'),
	deliveryDate: new Date('2026-05-29')
};

function invalidSpecRows(): string[] {
	const lists = [...document.querySelectorAll('dl')];
	expect(lists.length).toBeGreaterThan(0);
	return lists.flatMap((dl) =>
		[...dl.children].flatMap((row) =>
			row.tagName === 'DIV'
				? [...row.children]
						.filter((child) => child.tagName !== 'DT' && child.tagName !== 'DD')
						.map((child) => child.outerHTML)
				: row.tagName === 'DT' || row.tagName === 'DD'
					? []
					: [row.outerHTML]
		)
	);
}

describe('spec lists hold only dt and dd in each row', () => {
	it('keyboard details', async () => {
		await render(KeyboardDetails, {
			keyboard: {
				id: 'k',
				brand: 'KBDFans',
				name: 'Agar',
				design: { topCase: { material: 'Polycarbonate', color: 'White' } },
				plates: [{ id: 'p', material: 'PC', purchase }],
				pcbs: [{ id: 'c', thickness: 1.6, firmware: 'QMK' }],
				purchase,
				totalCost: 250,
				currency: 'USD'
			},
			onImageClick: vi.fn(),
			showPrice: true
		});

		expect(invalidSpecRows()).toEqual([]);
	});

	it('switch details', async () => {
		await render(SwitchDetails, {
			sw: {
				id: 's',
				brand: 'HMX',
				name: 'Aperol',
				type: 'Linear',
				specs: { actuationForce: 45, totalTravel: 3.5 },
				purchase
			} as never,
			onImageClick: vi.fn(),
			showPrice: true
		});

		expect(invalidSpecRows()).toEqual([]);
	});

	it('keycap set details', async () => {
		await render(KeycapSetDetails, {
			set: {
				id: 'set-1',
				brand: 'GMK',
				name: 'Olivia',
				visibility: Visibility.Public,
				totalCost: 51,
				currency: 'USD',
				kits: [{ kitId: 'base', name: 'Base' }]
			} as never,
			failedImages: new Set<string>(),
			onImageError: vi.fn(),
			onKitClick: vi.fn(),
			showPrice: true
		});

		expect(invalidSpecRows()).toEqual([]);
	});

	it('build details', async () => {
		await render(BuildDetails, {
			build: {
				id: 'b',
				visibility: Visibility.Public,
				keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
				plate: { id: 'p', material: 'Aluminum', thickness: 1.5 },
				pcb: { id: 'c', firmware: 'QMK' },
				foam: true,
				totalCost: 300,
				currency: 'USD'
			} as never,
			onKeyboardClick: vi.fn(),
			onSwitchClick: vi.fn(),
			onKeycapKitClick: vi.fn(),
			onImageClick: vi.fn(),
			showPrice: true
		});

		expect(invalidSpecRows()).toEqual([]);
	});
});

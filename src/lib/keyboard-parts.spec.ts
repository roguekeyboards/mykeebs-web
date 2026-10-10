import { describe, expect, it } from 'vitest';
import {
	pcbDraft,
	pcbInput,
	pcbLabel,
	plateDraft,
	plateInput,
	plateLabel,
	purchaseDraft,
	purchaseInput,
	purchaseSummary
} from './keyboard-parts';

const purchase = {
	vendor: 'CannonKeys',
	price: 40,
	currency: 'USD',
	orderDate: new Date('2026-03-01'),
	deliveryDate: new Date('2026-04-02'),
	orderStatus: 'Delivered'
};

describe('purchaseSummary', () => {
	it('names the vendor and status, or nothing when neither is set', () => {
		expect(purchaseSummary(purchaseDraft(purchase))).toBe('CannonKeys · Delivered');
		expect(purchaseSummary(purchaseDraft({ price: 10 }))).toBeUndefined();
	});
});

describe('purchaseInput', () => {
	it('round-trips a purchase, leaving out the read-only currency', () => {
		expect(purchaseInput(purchaseDraft(purchase))).toEqual({
			vendor: 'CannonKeys',
			price: 40,
			orderDate: new Date('2026-03-01'),
			deliveryDate: new Date('2026-04-02'),
			orderStatus: 'Delivered'
		});
	});

	it('is undefined when nothing is filled in', () => {
		expect(purchaseInput(purchaseDraft())).toBeUndefined();
		expect(
			purchaseInput({ ...purchaseDraft(), vendor: '  ', price: null as never })
		).toBeUndefined();
	});
});

describe('plates', () => {
	it("keeps an existing plate's id on the draft and its fields in the input", () => {
		const draft = plateDraft({
			id: 'p1',
			material: 'POM',
			color: 'Black',
			thickness: 1.5,
			purchase
		});
		expect(draft.id).toBe('p1');
		const input = plateInput(draft);
		expect(input).toMatchObject({ material: 'POM', color: 'Black', thickness: 1.5 });
		expect(input.purchase?.vendor).toBe('CannonKeys');
	});

	it('trims a new plate', () => {
		const draft = { ...plateDraft(), material: ' FR4 ', color: '  ' };
		expect(draft.id).toBeUndefined();
		expect(plateInput(draft)).toEqual({
			material: 'FR4',
			color: undefined,
			thickness: undefined,
			purchase: undefined
		});
	});

	it('gives each new plate its own key', () => {
		expect(plateDraft().key).not.toBe(plateDraft().key);
	});

	it('leaves out a purchase with nothing filled in', () => {
		const draft = plateDraft({ id: 'p1', material: 'POM', purchase });
		draft.purchase = purchaseDraft();
		expect(plateInput(draft).purchase).toBeUndefined();
	});

	it('labels a plate by material, color and thickness', () => {
		expect(plateLabel({ material: 'POM', color: 'Black', thickness: 1.5 })).toBe(
			'POM · Black · 1.5mm'
		);
		expect(plateLabel({ material: 'FR4' })).toBe('FR4');
	});
});

describe('PCBs', () => {
	it("keeps an existing PCB's id on the draft and its fields in the input", () => {
		const pcb = {
			id: 'c1',
			thickness: 1.2,
			firmware: 'QMK',
			assembly: 'Hotswap',
			connectivity: 'Wired'
		};
		const draft = pcbDraft(pcb);
		expect(draft.id).toBe('c1');
		expect(pcbInput(draft)).toEqual({
			thickness: 1.2,
			firmware: 'QMK',
			assembly: 'Hotswap',
			connectivity: 'Wired',
			purchase: undefined
		});
	});

	it('labels a PCB by its details, or just "PCB" when it has none', () => {
		expect(pcbLabel({ assembly: 'Solder', firmware: 'VIA', thickness: 1.6 })).toBe(
			'Solder · VIA · 1.6mm'
		);
		expect(pcbLabel({})).toBe('PCB');
	});
});

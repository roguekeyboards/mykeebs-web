import type {
	KeyboardPCB,
	KeyboardPCBInput,
	KeyboardPlate,
	KeyboardPlateInput,
	Purchase,
	PurchaseInput
} from '@roguekeyboards/mykeebs-api-client';
import { toDateInput } from '#lib/format.js';

export type PurchaseDraft = {
	vendor: string;
	price: number | undefined;
	orderDate: string;
	deliveryDate: string;
	estimatedDeliveryDate: string;
	orderStatus: string;
};

export type PlateDraft = {
	key: string;
	id?: string;
	material: string;
	color: string;
	thickness: number | undefined;
	purchaseOpen: boolean;
	purchase: PurchaseDraft;
};

export type PcbDraft = {
	key: string;
	id?: string;
	thickness: number | undefined;
	firmware: string;
	assembly: string;
	connectivity: string;
	purchaseOpen: boolean;
	purchase: PurchaseDraft;
};

export type KeyboardParts = { plates: PlateDraft[]; pcbs: PcbDraft[] };

let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

export function purchaseDraft(purchase?: Purchase): PurchaseDraft {
	return {
		vendor: purchase?.vendor ?? '',
		price: purchase?.price,
		orderDate: toDateInput(purchase?.orderDate),
		deliveryDate: toDateInput(purchase?.deliveryDate),
		estimatedDeliveryDate: toDateInput(purchase?.estimatedDeliveryDate),
		orderStatus: purchase?.orderStatus ?? ''
	};
}

export function purchaseInput(draft: PurchaseDraft): PurchaseInput | undefined {
	const input: PurchaseInput = {
		vendor: draft.vendor.trim() || undefined,
		price: draft.price ?? undefined,
		orderDate: toDate(draft.orderDate),
		deliveryDate: toDate(draft.deliveryDate),
		estimatedDeliveryDate: toDate(draft.estimatedDeliveryDate),
		orderStatus: draft.orderStatus.trim() || undefined
	};
	return Object.values(input).some((v) => v !== undefined) ? input : undefined;
}

function toDate(input: string): Date | undefined {
	return input.trim() ? new Date(input.trim()) : undefined;
}

export function purchaseDateError(draft: PurchaseDraft): string | undefined {
	const orderDate = draft.orderDate.trim();
	const before = (date: string) =>
		orderDate !== '' && date.trim() !== '' && date.trim() < orderDate;
	if (before(draft.deliveryDate)) return "Delivery date can't be before the order date.";
	if (before(draft.estimatedDeliveryDate))
		return "Estimated delivery can't be before the order date.";
	return undefined;
}

export function purchaseSummary(draft: PurchaseDraft): string | undefined {
	return [draft.vendor.trim(), draft.orderStatus.trim()].filter(Boolean).join(' · ') || undefined;
}

export function plateDraft(plate?: KeyboardPlate): PlateDraft {
	return {
		key: plate?.id ?? newKey(),
		id: plate?.id,
		material: plate?.material ?? '',
		color: plate?.color ?? '',
		thickness: plate?.thickness,
		purchaseOpen: Boolean(plate?.purchase),
		purchase: purchaseDraft(plate?.purchase)
	};
}

export function plateInput(draft: PlateDraft): KeyboardPlateInput {
	return {
		material: draft.material.trim(),
		color: draft.color.trim() || undefined,
		thickness: draft.thickness ?? undefined,
		purchase: purchaseInput(draft.purchase)
	};
}

export function pcbDraft(pcb?: KeyboardPCB): PcbDraft {
	return {
		key: pcb?.id ?? newKey(),
		id: pcb?.id,
		thickness: pcb?.thickness,
		firmware: pcb?.firmware ?? '',
		assembly: pcb?.assembly ?? '',
		connectivity: pcb?.connectivity ?? '',
		purchaseOpen: Boolean(pcb?.purchase),
		purchase: purchaseDraft(pcb?.purchase)
	};
}

export function pcbInput(draft: PcbDraft): KeyboardPCBInput {
	return {
		thickness: draft.thickness ?? undefined,
		firmware: draft.firmware.trim() || undefined,
		assembly: draft.assembly.trim() || undefined,
		connectivity: draft.connectivity.trim() || undefined,
		purchase: purchaseInput(draft.purchase)
	};
}

const mm = (thickness: number | undefined) => (thickness != null ? `${thickness}mm` : undefined);

export function plateLabel(plate: {
	material: string;
	color?: string;
	thickness?: number;
}): string {
	return [plate.material, plate.color, mm(plate.thickness)].filter(Boolean).join(' · ');
}

export function pcbLabel(pcb: {
	thickness?: number;
	firmware?: string;
	assembly?: string;
	connectivity?: string;
}): string {
	return (
		[pcb.assembly, pcb.firmware, pcb.connectivity, mm(pcb.thickness)].filter(Boolean).join(' · ') ||
		'PCB'
	);
}

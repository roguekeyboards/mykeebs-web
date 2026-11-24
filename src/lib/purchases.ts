import type { SwitchPurchaseInput } from '@roguekeyboards/mykeebs-api-client';
import type { PurchaseLike } from '#lib/format.js';
import {
	purchaseDraft,
	purchaseInput,
	purchaseSummary,
	type PurchaseDraft
} from '#lib/keyboard-parts.js';

type WithPurchases = { purchases?: PurchaseLike[] };

const isCancelled = (p: PurchaseLike) => p.orderStatus?.toLowerCase() === 'cancelled';

export function earliestDate(
	item: WithPurchases,
	field: 'orderDate' | 'deliveryDate'
): number | undefined {
	const purchases = item.purchases ?? [];
	const live = purchases.filter((p) => !isCancelled(p));
	const times = (live.length > 0 ? live : purchases).flatMap((p) => {
		const date = p[field];
		return date ? [date.getTime()] : [];
	});
	return times.length > 0 ? Math.min(...times) : undefined;
}

export type BulkPurchaseDraft = PurchaseDraft & { key: string; quantity: number | undefined };

let nextKey = 0;

export function bulkPurchaseDraft(purchase?: PurchaseLike): BulkPurchaseDraft {
	return {
		key: `purchase-${nextKey++}`,
		...purchaseDraft(purchase),
		quantity: purchase?.quantity
	};
}

export function bulkPurchaseDrafts(purchases: PurchaseLike[] | undefined): BulkPurchaseDraft[] {
	return purchases?.length ? purchases.map(bulkPurchaseDraft) : [bulkPurchaseDraft()];
}

export function bulkPurchaseInputs(drafts: BulkPurchaseDraft[]): SwitchPurchaseInput[] {
	return drafts.flatMap((draft) => {
		const purchase = purchaseInput(draft);
		const quantity = draft.quantity ?? undefined;
		return purchase || quantity != null ? [{ ...purchase, quantity }] : [];
	});
}

export function bulkPurchasesSummary(drafts: BulkPurchaseDraft[]): string | undefined {
	const filled = drafts.filter((draft) => bulkPurchaseInputs([draft]).length > 0);
	if (filled.length > 1) return `${filled.length} purchases`;
	return filled.length === 1 ? purchaseSummary(filled[0]) : undefined;
}

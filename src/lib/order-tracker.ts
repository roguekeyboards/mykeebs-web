import type { ECPart, Keyboard, KeycapSet, Switch } from '@roguekeyboards/mykeebs-api-client';
import { ecPartTypeLabel } from '#lib/ec-parts.js';
import { awaitingDelivery, quarterEndOf, quarterLabel } from '#lib/estimated-delivery.js';
import { toDateInput, type PurchaseLike } from '#lib/format.js';

export type OrderKind = 'keyboard' | 'plate' | 'pcb' | 'keycaps' | 'switches' | 'ec-parts';

export type Order = {
	key: string;
	kind: OrderKind;
	itemId: string;
	name: string;
	detail: string | undefined;
	purchase: PurchaseLike;
	statuses: string[];
	kits?: string[];
};

export type OrderSection = {
	key: string;
	title: string;
	tone: 'overdue' | 'quarter' | 'unestimated';
	current: boolean;
	orders: Order[];
	total: number | undefined;
	currency: string | undefined;
};

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
	keyboard: 'Keyboard',
	plate: 'Plate',
	pcb: 'PCB',
	keycaps: 'Keycaps',
	switches: 'Switches',
	'ec-parts': 'EC parts'
};

const joined = (...parts: (string | number | undefined)[]) =>
	parts.filter((p) => p !== undefined && p !== '').join(' · ') || undefined;

export function ordersAwaitingDelivery(lists: {
	keyboards: Keyboard[];
	keycapSets: KeycapSet[];
	switches: Switch[];
	ecParts: ECPart[];
}): Order[] {
	const orders: Order[] = [];
	const add = (order: Omit<Order, 'key' | 'statuses'>, key: string) => {
		const status = order.purchase.orderStatus;
		if (awaitingDelivery(status)) orders.push({ ...order, key, statuses: status ? [status] : [] });
	};

	for (const keyboard of lists.keyboards) {
		const base = { itemId: keyboard.id, name: keyboard.name };
		const board = keyboard.purchase;
		const parts = [
			...(keyboard.plates ?? []).map((plate, i) => ({
				kind: 'plate' as const,
				key: `plate-${keyboard.id}-${plate.id}`,
				detail: joined(`Plate ${i + 1}`, plate.material),
				purchase: plate.purchase
			})),
			...(keyboard.pcbs ?? []).map((pcb, i) => ({
				kind: 'pcb' as const,
				key: `pcb-${keyboard.id}-${pcb.id}`,
				detail: joined(`PCB ${i + 1}`, pcb.assembly),
				purchase: pcb.purchase
			}))
		];
		const withBoard = parts.filter((part) => orderedWith(part.purchase, board));

		if (board) {
			const partPrices = withBoard.flatMap((part) => part.purchase?.price ?? []);
			add(
				{
					...base,
					kind: 'keyboard',
					detail: joined(keyboard.brand, keyboard.size),
					purchase: partPrices.length
						? {
								...board,
								price: partPrices.reduce((sum, p) => sum + p, board.price ?? 0),
								currency:
									board.currency ?? withBoard.map((part) => part.purchase?.currency).find(Boolean)
							}
						: board
				},
				`keyboard-${keyboard.id}`
			);
		}
		for (const part of parts) {
			if (!part.purchase || withBoard.includes(part)) continue;
			add({ ...base, kind: part.kind, detail: part.detail, purchase: part.purchase }, part.key);
		}
	}

	for (const set of lists.keycapSets) {
		for (const kit of set.kits ?? []) {
			if (!kit.purchase) continue;
			add(
				{
					kind: 'keycaps',
					itemId: set.id,
					name: `${set.brand} ${set.name}`,
					detail: `Kit: ${kit.name}`,
					purchase: kit.purchase,
					kits: [kit.name]
				},
				`kit-${set.id}-${kit.kitId}`
			);
		}
	}

	for (const sw of lists.switches) {
		sw.purchases?.forEach((purchase, i) => {
			add(
				{
					kind: 'switches',
					itemId: sw.id,
					name: `${sw.brand} ${sw.name}`,
					detail: purchase.quantity != null ? `${purchase.quantity} switches` : undefined,
					purchase
				},
				`switch-${sw.id}-${i}`
			);
		});
	}

	for (const part of lists.ecParts) {
		part.purchases?.forEach((purchase, i) => {
			add(
				{
					kind: 'ec-parts',
					itemId: part.id,
					name: `${part.brand} ${part.name}`,
					detail: joined(
						ecPartTypeLabel(part.partType),
						purchase.quantity != null ? `${purchase.quantity} pieces` : undefined
					),
					purchase
				},
				`ec-part-${part.id}-${i}`
			);
		});
	}

	return orders;
}

const time = (date: Date | undefined) => date?.getTime() ?? Infinity;

const sameVendor = (a: string | undefined, b: string | undefined) =>
	(a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

function orderedWith(part: PurchaseLike | undefined, board: PurchaseLike | undefined): boolean {
	return (
		part !== undefined &&
		board !== undefined &&
		awaitingDelivery(part.orderStatus) &&
		awaitingDelivery(board.orderStatus) &&
		board.orderDate !== undefined &&
		toDateInput(part.orderDate) === toDateInput(board.orderDate) &&
		sameVendor(part.vendor, board.vendor)
	);
}

const earlier = (a: Date | undefined, b: Date | undefined) => (time(b) < time(a) ? b : a);

const unique = <T>(values: (T | undefined)[]) => [
	...new Set(values.filter((v): v is T => v !== undefined && v !== ''))
];

function mergeKits(orders: Order[]): Order[] {
	const sets = new Map<string, Order[]>();
	const rest: Order[] = [];
	for (const order of orders) {
		if (order.kind === 'keycaps')
			sets.set(order.itemId, [...(sets.get(order.itemId) ?? []), order]);
		else rest.push(order);
	}
	const merged = [...sets.values()].map((kits): Order => {
		if (kits.length === 1) return kits[0];
		const purchases = kits.map((k) => k.purchase);
		const prices = purchases.map((p) => p.price).filter((p) => p !== undefined);
		const names = kits.flatMap((k) => k.kits ?? []);
		return {
			...kits[0],
			key: `kits-${kits[0].itemId}`,
			detail: `Kits: ${names.join(', ')}`,
			kits: names,
			statuses: unique(kits.flatMap((k) => k.statuses)),
			purchase: {
				vendor: unique(purchases.map((p) => p.vendor)).join(', ') || undefined,
				orderDate: purchases.map((p) => p.orderDate).reduce(earlier),
				estimatedDeliveryDate: purchases.map((p) => p.estimatedDeliveryDate).reduce(earlier),
				price: prices.length ? prices.reduce((sum, p) => sum + p, 0) : undefined,
				currency: purchases.map((p) => p.currency).find(Boolean)
			}
		};
	});
	return [...rest, ...merged];
}

function byExpected(a: Order, b: Order): number {
	return (
		time(a.purchase.estimatedDeliveryDate) - time(b.purchase.estimatedDeliveryDate) ||
		time(a.purchase.orderDate) - time(b.purchase.orderDate) ||
		a.name.localeCompare(b.name)
	);
}

function section(
	key: string,
	title: string,
	tone: OrderSection['tone'],
	orders: Order[],
	current = false
): OrderSection {
	const currency = orders.map((o) => o.purchase.currency).find(Boolean);
	return {
		key,
		title,
		tone,
		current,
		orders: mergeKits(orders).sort(byExpected),
		currency,
		total: currency ? orders.reduce((sum, o) => sum + (o.purchase.price ?? 0), 0) : undefined
	};
}

export function sectionsByQuarter(orders: Order[], today: string): OrderSection[] {
	const thisQuarter = quarterEndOf(today) ?? today;
	const overdue: Order[] = [];
	const unestimated: Order[] = [];
	const quarters = new Map<string, Order[]>();

	for (const order of orders) {
		const estimate = order.purchase.estimatedDeliveryDate;
		const quarter = estimate && quarterEndOf(toDateInput(estimate));
		if (!quarter) unestimated.push(order);
		else if (quarter < thisQuarter) overdue.push(order);
		else quarters.set(quarter, [...(quarters.get(quarter) ?? []), order]);
	}

	return [
		...(overdue.length ? [section('overdue', 'Overdue', 'overdue', overdue)] : []),
		...[...quarters.keys()]
			.sort()
			.map((quarter) =>
				section(
					quarter,
					quarterLabel(quarter)!,
					'quarter',
					quarters.get(quarter)!,
					quarter === thisQuarter
				)
			),
		...(unestimated.length
			? [section('unestimated', 'No estimate', 'unestimated', unestimated)]
			: [])
	];
}

export function isLate(order: Order, today: string): boolean {
	const estimate = order.purchase.estimatedDeliveryDate;
	return estimate !== undefined && toDateInput(estimate) < today;
}

import type {
	Build,
	ECPart,
	Keyboard,
	KeycapSet,
	Switch
} from '@roguekeyboards/mykeebs-api-client';
import type { StatusFilter } from '#lib/order-status.js';

type Entry = { status: string; price: number | undefined };

export type CollectionStats = {
	keyboards: Entry[];
	switches: Entry[];
	ecParts: Entry[];
	keycapSets: Entry[];
	builds: number;
	buildsTotalCost: number;
	currency: string | undefined;
};

export type Tally = {
	keyboards: number;
	switches: number;
	ecParts: number;
	keycapSets: number;
	builds: number;
};

export function collectionStats(lists: {
	keyboards: Keyboard[];
	switches: Switch[];
	ecParts: ECPart[];
	keycapSets: KeycapSet[];
	builds: Build[];
}): CollectionStats {
	const { keyboards, switches, ecParts, keycapSets, builds } = lists;
	return {
		keyboards: keyboards.map((k) => ({
			status: k.purchase?.orderStatus ?? '',
			price: k.totalCost
		})),
		switches: switches.map((s) => ({ status: s.orderStatus ?? '', price: s.totalCost })),
		ecParts: ecParts.map((p) => ({ status: p.orderStatus ?? '', price: p.totalCost })),
		keycapSets: keycapSets.map((k) => ({ status: k.orderStatus ?? '', price: k.totalCost })),
		builds: builds.length,
		buildsTotalCost: builds.reduce((sum, b) => sum + (b.totalCost ?? 0), 0),
		// Undefined when mykeebs-api withheld every price, which hides the totals
		// rather than showing a misleading $0.00.
		currency: [...keyboards, ...switches, ...ecParts, ...keycapSets, ...builds]
			.map((i) => i.currency)
			.find(Boolean)
	};
}

function matching(entries: Entry[], filter: StatusFilter): Entry[] {
	return filter === 'all' ? entries : entries.filter((e) => e.status.toLowerCase() === filter);
}

function sum(entries: Entry[]): number {
	return entries.reduce((total, e) => total + (e.price ?? 0), 0);
}

// Builds carry no order status, so they only count under 'all'.
export function countsFor(stats: CollectionStats, filter: StatusFilter): Tally {
	return {
		keyboards: matching(stats.keyboards, filter).length,
		switches: matching(stats.switches, filter).length,
		ecParts: matching(stats.ecParts, filter).length,
		keycapSets: matching(stats.keycapSets, filter).length,
		builds: filter === 'all' ? stats.builds : 0
	};
}

export function totalsFor(stats: CollectionStats, filter: StatusFilter): Tally {
	return {
		keyboards: sum(matching(stats.keyboards, filter)),
		switches: sum(matching(stats.switches, filter)),
		ecParts: sum(matching(stats.ecParts, filter)),
		keycapSets: sum(matching(stats.keycapSets, filter)),
		builds: filter === 'all' ? stats.buildsTotalCost : 0
	};
}

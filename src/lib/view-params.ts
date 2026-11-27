import type { FieldFilter } from '#lib/collection-filter.js';
import { STATUS_FILTERS, type StatusFilter } from '#lib/order-status.js';

export type View = {
	status: StatusFilter;
	filters: FieldFilter[];
	text: string;
	sort: string | null;
	descending: boolean;
};

export type ViewOptions = { tags: string[]; sorts: string[] };

export const VIEW_KEYS = ['status', 'f', 'q', 'sort', 'desc'] as const;

export const DEFAULT_VIEW: View = {
	status: 'all',
	filters: [],
	text: '',
	sort: null,
	descending: false
};

export function sortSlug(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

// `brand:Gateron` was typed and matches as a substring; `brand:=Gateron` was picked and matches exactly.
function parseFilter(raw: string, tags: string[]): FieldFilter | null {
	const match = /^([a-z]+):(=?)(.*)$/i.exec(raw);
	if (!match) return null;
	const tag = match[1].toLowerCase();
	const value = match[3].trim();
	if (!tags.includes(tag) || !value) return null;
	return match[2] ? { tag, value, exact: true } : { tag, value };
}

export function readView(
	params: Pick<URLSearchParams, 'get' | 'getAll'>,
	{ tags, sorts }: ViewOptions
): View {
	const status = params.get('status')?.toLowerCase();
	const sort = params.get('sort')?.toLowerCase() ?? null;
	return {
		status: STATUS_FILTERS.find((filter) => filter === status) ?? 'all',
		filters: params
			.getAll('f')
			.map((raw) => parseFilter(raw, tags))
			.filter((filter) => filter !== null),
		text: params.get('q')?.trim() ?? '',
		sort: sort && sorts.includes(sort) ? sort : null,
		descending: params.get('desc') === '1'
	};
}

export function viewParams(view: View): URLSearchParams {
	const params = new URLSearchParams();
	if (view.status !== 'all') params.set('status', view.status);
	for (const filter of view.filters) {
		params.append('f', `${filter.tag}:${filter.exact ? '=' : ''}${filter.value}`);
	}
	if (view.text.trim()) params.set('q', view.text.trim());
	if (view.sort) params.set('sort', view.sort);
	if (view.descending) params.set('desc', '1');
	return params;
}

export function urlWithView(url: { href: string }, view: View): URL {
	const next = new URL(url.href);
	for (const key of VIEW_KEYS) next.searchParams.delete(key);
	for (const [key, value] of viewParams(view)) next.searchParams.append(key, value);
	return next;
}

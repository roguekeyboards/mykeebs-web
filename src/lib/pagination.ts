const PAGE_LIMIT = 100;

type Page<T> = { items?: T[]; nextCursor?: string | null };
export type PageRequest = { cursor: string | undefined; limit: number };

export async function fetchAllPages<T>(
	fetchPage: (request: PageRequest) => Promise<Page<T>>
): Promise<T[]> {
	const items: T[] = [];
	let cursor: string | undefined;
	do {
		const page = await fetchPage({ cursor, limit: PAGE_LIMIT });
		items.push(...(page.items ?? []));
		cursor = page.nextCursor ?? undefined;
	} while (cursor);
	return items;
}

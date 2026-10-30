import { describe, expect, it } from 'vitest';
import { Visibility, type Build } from '@roguekeyboards/kbdb-api-client';
import { groupByKeyboard, newestFirst } from './build-groups';

function build(
	id: string,
	keyboardId: string,
	date?: string,
	visibility: Visibility = Visibility.Public
): Build {
	return {
		id,
		keyboard: { id: keyboardId, brand: 'Bowl', name: 'Manta' },
		buildDate: date ? new Date(date) : undefined,
		visibility
	};
}

describe('groupByKeyboard', () => {
	it('groups builds by keyboard, with the most recent build as current', () => {
		const groups = groupByKeyboard([
			build('older', 'kb-1', '2026-01-01'),
			build('other', 'kb-2', '2026-03-01'),
			build('newer', 'kb-1', '2026-06-01')
		]);

		expect(groups.map((g) => [g.keyboardId, g.current.id, g.buildCount])).toEqual([
			['kb-1', 'newer', 2],
			['kb-2', 'other', 1]
		]);
		expect(groups[0].builds.map((b) => b.id)).toEqual(['newer', 'older']);
	});

	it('treats an undated build as older than any dated one', () => {
		const [group] = groupByKeyboard([
			build('undated', 'kb-1'),
			build('dated', 'kb-1', '2020-01-01')
		]);

		expect(group.current.id).toBe('dated');
	});

	it("flags a keyboard whose builds don't all share one visibility", () => {
		const groups = groupByKeyboard([
			build('a', 'kb-1', '2026-01-01', Visibility.Public),
			build('b', 'kb-1', '2026-02-01', Visibility.Private),
			build('c', 'kb-2', '2026-01-01', Visibility.Public),
			build('d', 'kb-2', '2026-02-01', Visibility.Public)
		]);

		expect(groups.map((g) => [g.keyboardId, g.mixedVisibility])).toEqual([
			['kb-1', true],
			['kb-2', false]
		]);
	});

	it('is empty when there are no builds', () => {
		expect(groupByKeyboard([])).toEqual([]);
	});
});

describe('newestFirst', () => {
	it('orders builds newest first, with undated builds last', () => {
		const builds = [
			build('mid', 'kb', '2026-03-01'),
			build('undated', 'kb'),
			build('newest', 'kb', '2026-09-01'),
			build('oldest', 'kb', '2025-01-01')
		];

		expect(builds.sort(newestFirst).map((b) => b.id)).toEqual([
			'newest',
			'mid',
			'oldest',
			'undated'
		]);
	});
});

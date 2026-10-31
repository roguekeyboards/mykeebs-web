import { describe, expect, it } from 'vitest';
import { ResponseError, type Build } from '@roguekeyboards/mykeebs-api-client';
import { blockingBuildIdsFromError, blockingBuildLabels, deleteFailure } from './delete-blocked';

function problem(status: number, body: unknown): ResponseError {
	return new ResponseError(
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/problem+json' }
		})
	);
}

describe('blockingBuildIdsFromError', () => {
	it("reads the blocking builds from mykeebs-api's 409 problem response", async () => {
		const err = problem(409, {
			type: 'about:blank',
			title: 'Conflict',
			status: 409,
			blocking_build_ids: ['b-1', 'b-2']
		});

		expect(await blockingBuildIdsFromError(err)).toEqual(['b-1', 'b-2']);
	});

	it('is empty for a 409 that names no builds', async () => {
		expect(
			await blockingBuildIdsFromError(problem(409, { type: 'about:blank', status: 409 }))
		).toEqual([]);
		expect(
			await blockingBuildIdsFromError(new ResponseError(new Response('oops', { status: 409 })))
		).toEqual([]);
	});

	it('is null for any other failure', async () => {
		expect(await blockingBuildIdsFromError(problem(404, { status: 404 }))).toBeNull();
		expect(await blockingBuildIdsFromError(new Error('network'))).toBeNull();
	});
});

describe('blockingBuildLabels', () => {
	const build = (id: string, buildDate?: Date): Build => ({
		id,
		keyboard: { id: 'kb', brand: 'KBDFans', name: 'Agar' },
		buildDate
	});

	it('tells builds of the same keyboard apart by build date', async () => {
		const builds: Record<string, Build> = {
			'b-1': build('b-1', new Date('2026-09-12')),
			'b-2': build('b-2', new Date('2026-06-26'))
		};

		const labels = await blockingBuildLabels(['b-1', 'b-2'], async (id) => builds[id]);

		expect(labels).toEqual(['Agar (Sep 12, 2026)', 'Agar (Jun 26, 2026)']);
	});

	it('falls back to the keyboard name for an undated build', async () => {
		expect(await blockingBuildLabels(['b'], async () => build('b'))).toEqual(['Agar']);
	});

	it("still lists a build it couldn't read", async () => {
		const labels = await blockingBuildLabels(['b'], async () => {
			throw new Error('404');
		});

		expect(labels).toEqual(['a build']);
	});
});

describe('deleteFailure', () => {
	const messages = { stillUsed: 'Still used.', failed: 'Could not delete.' };
	const build = (name: string): Build =>
		({ id: name, keyboard: { id: 'k', brand: 'B', name } }) as Build;

	it('names the builds that block the delete', async () => {
		const err = problem(409, { status: 409, blocking_build_ids: ['b-1', 'b-2'] });
		const getBuild = async (id: string) => build(id === 'b-1' ? 'Manta' : 'Agar');

		expect(await deleteFailure(err, getBuild, messages)).toEqual({
			blockingBuilds: ['Manta', 'Agar']
		});
	});

	it('says the item is still used when the conflict names no builds', async () => {
		const err = problem(409, { status: 409 });

		expect(await deleteFailure(err, async () => build('x'), messages)).toEqual({
			error: 'Still used.'
		});
	});

	it('falls back to a plain failure for anything else', async () => {
		expect(await deleteFailure(problem(500, {}), async () => build('x'), messages)).toEqual({
			error: 'Could not delete.'
		});
		expect(await deleteFailure(new Error('network'), async () => build('x'), messages)).toEqual({
			error: 'Could not delete.'
		});
	});
});

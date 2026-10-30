import { describe, expect, it } from 'vitest';
import { ResponseError, Visibility, type BuildInput } from '@roguekeyboards/kbdb-api-client';
import { kitKey, staleBuildRefs, staleBuildRefsFromError } from './build-refs';

const input: BuildInput = {
	keyboard: 'kb',
	visibility: Visibility.Private,
	switches: [
		{ _switch: 'sw-a', count: 70 },
		{ _switch: 'sw-b', count: 4 }
	],
	keycapKits: [
		{ keycapSet: 'set-1', kit: 'base' },
		{ keycapSet: 'set-1', kit: 'novelties' },
		{ keycapSet: 'set-2', kit: 'base' }
	]
};

function problem(status: number, body: unknown): ResponseError {
	return new ResponseError(
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/problem+json' }
		})
	);
}

describe('staleBuildRefs', () => {
	it('maps the indices kbdb reports back to the entries that were submitted', () => {
		const refs = staleBuildRefs(input, [
			{ name: 'switches[1].switch' },
			{ name: 'keycap_kits[1].kit' },
			{ name: 'keycap_kits[2].keycap_set' }
		]);

		expect(refs).toEqual({
			keyboardId: null,
			switchIds: new Set(['sw-b']),
			kitKeys: new Set([kitKey('set-1', 'novelties'), kitKey('set-2', 'base')])
		});
	});

	it('flags the keyboard', () => {
		expect(staleBuildRefs(input, [{ name: 'keyboard' }])?.keyboardId).toBe('kb');
	});

	it('ignores fields that are not references, and indices past the end', () => {
		expect(
			staleBuildRefs(input, [
				{ name: 'notes' },
				{ name: 'switches[9].switch' },
				{ name: 'keycap_kits[9].kit' }
			])
		).toBeNull();
	});
});

describe('staleBuildRefsFromError', () => {
	it("reads the stale entries from kbdb's 400 problem response", async () => {
		const err = problem(400, {
			status: 400,
			detail: 'one or more fields do not reference resources in your collection',
			invalid_params: [{ name: 'keycap_kits[0].kit', reason: 'does not reference a kit' }]
		});

		const refs = await staleBuildRefsFromError(err, input);

		expect(refs?.kitKeys).toEqual(new Set([kitKey('set-1', 'base')]));
	});

	it('leaves the response body readable for other error handling', async () => {
		const err = problem(400, { invalid_params: [{ name: 'keyboard' }] });

		await staleBuildRefsFromError(err, input);

		await expect(err.response.json()).resolves.toEqual({ invalid_params: [{ name: 'keyboard' }] });
	});

	it('is null for any other failure', async () => {
		expect(await staleBuildRefsFromError(new Error('network'), input)).toBeNull();
		expect(await staleBuildRefsFromError(problem(500, {}), input)).toBeNull();
		expect(await staleBuildRefsFromError(problem(400, { detail: 'bad date' }), input)).toBeNull();
		expect(
			await staleBuildRefsFromError(
				new ResponseError(new Response('not json', { status: 400 })),
				input
			)
		).toBeNull();
	});
});

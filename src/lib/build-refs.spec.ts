import { describe, expect, it } from 'vitest';
import { ResponseError, Visibility, type BuildInput } from '@roguekeyboards/mykeebs-api-client';
import {
	buildSaveFailure,
	kitKey,
	PARTS_MISMATCH_MESSAGE,
	STALE_REFS_MESSAGE,
	staleBuildRefs
} from './build-refs';

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
	it('maps the indices mykeebs-api reports back to the entries that were submitted', () => {
		const refs = staleBuildRefs(input, [
			{ name: 'switches[1].switch' },
			{ name: 'keycap_kits[1].kit' },
			{ name: 'keycap_kits[2].keycap_set' }
		]);

		expect(refs).toEqual({
			keyboardId: null,
			switchIds: new Set(['sw-b']),
			ecPartIds: new Set(),
			kitKeys: new Set([kitKey('set-1', 'novelties'), kitKey('set-2', 'base')])
		});
	});

	it("flags an EC build's stale parts", () => {
		const ecInput: BuildInput = {
			keyboard: 'kb',
			visibility: Visibility.Private,
			buildType: 'EC',
			ecParts: [
				{ ecPart: 'ec-a', count: 68 },
				{ ecPart: 'ec-b', count: 68 }
			]
		};

		expect(staleBuildRefs(ecInput, [{ name: 'ec_parts[1].ec_part' }])?.ecPartIds).toEqual(
			new Set(['ec-b'])
		);
	});

	it('flags the keyboard', () => {
		expect(staleBuildRefs(input, [{ name: 'keyboard' }])?.keyboardId).toBe('kb');
	});

	it('ignores fields that are not references, and indices past the end', () => {
		expect(
			staleBuildRefs(input, [
				{ name: 'notes' },
				{ name: 'switches[9].switch' },
				{ name: 'ec_parts[0].ec_part' },
				{ name: 'keycap_kits[9].kit' }
			])
		).toBeNull();
	});
});

describe('buildSaveFailure', () => {
	it('flags stale references', async () => {
		const err = problem(400, { invalid_params: [{ name: 'switches[0].switch' }] });

		const failure = await buildSaveFailure(err, input, 'Could not save.');

		expect(failure.message).toBe(STALE_REFS_MESSAGE);
		expect(failure.staleRefs?.switchIds).toEqual(new Set(['sw-a']));
	});

	it.each(['switches', 'ec_parts'])(
		'explains a %s list that does not match the build type',
		async (name) => {
			const err = problem(400, { invalid_params: [{ name, reason: 'not allowed' }] });

			expect(await buildSaveFailure(err, input, 'Could not save.')).toEqual({
				staleRefs: null,
				message: PARTS_MISMATCH_MESSAGE
			});
		}
	);

	it("reads the stale entries from mykeebs-api's 400 problem response", async () => {
		const err = problem(400, {
			status: 400,
			detail: 'one or more fields do not reference resources in your collection',
			invalid_params: [{ name: 'keycap_kits[0].kit', reason: 'does not reference a kit' }]
		});

		const { staleRefs } = await buildSaveFailure(err, input, 'Could not save.');

		expect(staleRefs?.kitKeys).toEqual(new Set([kitKey('set-1', 'base')]));
	});

	it('leaves the response body readable for other error handling', async () => {
		const err = problem(400, { invalid_params: [{ name: 'keyboard' }] });

		await buildSaveFailure(err, input, 'Could not save.');

		await expect(err.response.json()).resolves.toEqual({ invalid_params: [{ name: 'keyboard' }] });
	});

	it.each([
		['a network failure', new Error('network')],
		['a server error', problem(500, {})],
		['a 400 naming no fields', problem(400, { detail: 'bad date' })],
		['a 400 that is not JSON', new ResponseError(new Response('not json', { status: 400 }))]
	])('falls back for %s', async (_, err) => {
		expect(await buildSaveFailure(err, input, 'Could not save.')).toEqual({
			staleRefs: null,
			message: 'Could not save.'
		});
	});
});

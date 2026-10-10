import { describe, expect, it, vi } from 'vitest';
import { ResponseError, type Build, type Keyboard } from '@rogueserenity/kbdb-api-client';
import { pcbDraft, plateDraft, type KeyboardParts } from './keyboard-parts';
import {
	blockedRemovalMessage,
	removeParts,
	saveParts,
	type PartsApi
} from './keyboard-parts-save';

const saved: Keyboard = {
	id: 'kb',
	brand: 'Bowl',
	name: 'Manta',
	plates: [
		{ id: 'p1', material: 'POM' },
		{ id: 'p2', material: 'PC', color: 'Clear' }
	],
	pcbs: [{ id: 'c1', assembly: 'Hotswap', connectivity: 'Wired' }]
};

function fakeApi(): PartsApi & Record<keyof PartsApi, ReturnType<typeof vi.fn>> {
	let next = 0;
	return {
		createKeyboardPlate: vi.fn(async () => ({ id: `new-plate-${next++}`, material: '' })),
		updateKeyboardPlate: vi.fn(async () => ({})),
		deleteKeyboardPlate: vi.fn(async () => null),
		createKeyboardPCB: vi.fn(async () => ({ id: `new-pcb-${next++}` })),
		updateKeyboardPCB: vi.fn(async () => ({})),
		deleteKeyboardPCB: vi.fn(async () => null)
	} as never;
}

function partsOf(keyboard: Keyboard): KeyboardParts {
	return {
		plates: (keyboard.plates ?? []).map(plateDraft),
		pcbs: (keyboard.pcbs ?? []).map(pcbDraft)
	};
}

function conflict(blockingBuildIds: string[]): ResponseError {
	return new ResponseError(
		new Response(JSON.stringify({ status: 409, blocking_build_ids: blockingBuildIds }), {
			status: 409,
			headers: { 'Content-Type': 'application/problem+json' }
		})
	);
}

describe('removeParts', () => {
	it('deletes only the parts no longer in the form', async () => {
		const api = fakeApi();
		const parts = partsOf(saved);
		parts.plates.splice(0, 1);
		parts.pcbs = [];

		expect(await removeParts(api, 'u', saved, parts)).toEqual([]);

		expect(api.deleteKeyboardPlate).toHaveBeenCalledExactlyOnceWith({
			userId: 'u',
			keyboardId: 'kb',
			plateId: 'p1'
		});
		expect(api.deleteKeyboardPCB).toHaveBeenCalledExactlyOnceWith({
			userId: 'u',
			keyboardId: 'kb',
			pcbId: 'c1'
		});
	});

	it('reports a part a build still uses, and carries on with the rest', async () => {
		const api = fakeApi();
		api.deleteKeyboardPlate.mockRejectedValueOnce(conflict(['b1']));

		const blocked = await removeParts(api, 'u', saved, { plates: [], pcbs: [] });

		expect(blocked).toEqual([{ part: 'the POM plate', buildIds: ['b1'] }]);
		expect(api.deleteKeyboardPlate).toHaveBeenCalledTimes(2);
		expect(api.deleteKeyboardPCB).toHaveBeenCalledOnce();
	});

	it('rethrows any other failure', async () => {
		const api = fakeApi();
		api.deleteKeyboardPCB.mockRejectedValueOnce(new Error('network'));

		await expect(removeParts(api, 'u', saved, { plates: [], pcbs: [] })).rejects.toThrow('network');
	});
});

describe('saveParts', () => {
	it('sends nothing for parts that are unchanged', async () => {
		const api = fakeApi();

		await saveParts(api, 'u', saved, partsOf(saved));

		for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
	});

	it('updates only the changed parts, by id', async () => {
		const api = fakeApi();
		const parts = partsOf(saved);
		parts.plates[1].thickness = 1.5;

		await saveParts(api, 'u', saved, parts);

		expect(api.updateKeyboardPlate).toHaveBeenCalledExactlyOnceWith({
			userId: 'u',
			keyboardId: 'kb',
			plateId: 'p2',
			keyboardPlateInput: { material: 'PC', color: 'Clear', thickness: 1.5 }
		});
		expect(api.updateKeyboardPCB).not.toHaveBeenCalled();
	});

	it('adds new parts and records their ids, so saving again updates rather than re-adds', async () => {
		const api = fakeApi();
		const parts: KeyboardParts = {
			plates: [{ ...plateDraft(), material: 'FR4' }],
			pcbs: [{ ...pcbDraft(), assembly: 'Solder', connectivity: 'Wireless' }]
		};

		await saveParts(api, 'u', { id: 'kb' }, parts);
		await saveParts(api, 'u', { id: 'kb' }, parts);

		expect(api.createKeyboardPlate).toHaveBeenCalledExactlyOnceWith({
			userId: 'u',
			keyboardId: 'kb',
			keyboardPlateInput: { material: 'FR4' }
		});
		expect(api.createKeyboardPCB).toHaveBeenCalledOnce();
		expect(parts.plates[0].id).toBe('new-plate-0');
		expect(parts.pcbs[0].id).toBe('new-pcb-1');
		expect(api.updateKeyboardPlate).toHaveBeenCalledWith(
			expect.objectContaining({ plateId: 'new-plate-0' })
		);
	});
});

describe('blockedRemovalMessage', () => {
	const getBuild = async (buildId: string) =>
		({
			id: buildId,
			keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
			buildDate: new Date('2026-08-03')
		}) as Build;

	it('names each blocked part and the builds using it', async () => {
		expect(
			await blockedRemovalMessage(
				[
					{ part: 'the POM plate', buildIds: ['b1'] },
					{ part: 'the PCB', buildIds: [] }
				],
				getBuild
			)
		).toBe(
			"Can't remove the POM plate: it's used by Manta (Aug 3, 2026). " +
				"Can't remove the PCB: it's used by a build. " +
				'Change those builds first, or keep the part.'
		);
	});
});

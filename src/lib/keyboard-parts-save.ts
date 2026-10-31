import type { Build, Keyboard, KeyboardsApi } from '@roguekeyboards/mykeebs-api-client';
import { blockingBuildIdsFromError, blockingBuildLabels } from '#lib/delete-blocked.js';
import {
	pcbDraft,
	pcbInput,
	pcbLabel,
	plateDraft,
	plateInput,
	plateLabel,
	type KeyboardParts
} from '#lib/keyboard-parts.js';

export type PartsApi = Pick<
	KeyboardsApi,
	| 'createKeyboardPlate'
	| 'updateKeyboardPlate'
	| 'deleteKeyboardPlate'
	| 'createKeyboardPCB'
	| 'updateKeyboardPCB'
	| 'deleteKeyboardPCB'
>;

export type BlockedRemoval = { part: string; buildIds: string[] };

type Saved = Pick<Keyboard, 'id' | 'plates' | 'pcbs'>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function describePcb(pcb: Parameters<typeof pcbLabel>[0]): string {
	const label = pcbLabel(pcb);
	return label === 'PCB' ? 'the PCB' : `the ${label} PCB`;
}

export async function removeParts(
	api: PartsApi,
	userId: string,
	saved: Saved,
	parts: KeyboardParts
): Promise<BlockedRemoval[]> {
	const blocked: BlockedRemoval[] = [];
	const remove = async (part: string, request: () => Promise<unknown>) => {
		try {
			await request();
		} catch (err) {
			const buildIds = await blockingBuildIdsFromError(err);
			if (!buildIds) throw err;
			blocked.push({ part, buildIds });
		}
	};

	const keptPlates = new Set(parts.plates.map((p) => p.id));
	for (const plate of saved.plates ?? []) {
		if (keptPlates.has(plate.id)) continue;
		await remove(`the ${plateLabel(plate)} plate`, () =>
			api.deleteKeyboardPlate({ userId, keyboardId: saved.id, plateId: plate.id })
		);
	}
	const keptPcbs = new Set(parts.pcbs.map((p) => p.id));
	for (const pcb of saved.pcbs ?? []) {
		if (keptPcbs.has(pcb.id)) continue;
		await remove(describePcb(pcb), () =>
			api.deleteKeyboardPCB({ userId, keyboardId: saved.id, pcbId: pcb.id })
		);
	}
	return blocked;
}

// Records each new part's id on its draft as soon as it exists, so saving
// again after a failure updates it rather than adding it twice.
export async function saveParts(
	api: PartsApi,
	userId: string,
	saved: Saved,
	parts: KeyboardParts
): Promise<void> {
	const keyboardId = saved.id;

	const savedPlates = new Map(saved.plates?.map((p) => [p.id, p]));
	for (const draft of parts.plates) {
		const input = plateInput(draft);
		if (!draft.id) {
			draft.id = (
				await api.createKeyboardPlate({ userId, keyboardId, keyboardPlateInput: input })
			).id;
			continue;
		}
		const before = savedPlates.get(draft.id);
		if (before && same(plateInput(plateDraft(before)), input)) continue;
		await api.updateKeyboardPlate({
			userId,
			keyboardId,
			plateId: draft.id,
			keyboardPlateInput: input
		});
	}

	const savedPcbs = new Map(saved.pcbs?.map((p) => [p.id, p]));
	for (const draft of parts.pcbs) {
		const input = pcbInput(draft);
		if (!draft.id) {
			draft.id = (await api.createKeyboardPCB({ userId, keyboardId, keyboardPCBInput: input })).id;
			continue;
		}
		const before = savedPcbs.get(draft.id);
		if (before && same(pcbInput(pcbDraft(before)), input)) continue;
		await api.updateKeyboardPCB({ userId, keyboardId, pcbId: draft.id, keyboardPCBInput: input });
	}
}

export async function blockedRemovalMessage(
	blocked: BlockedRemoval[],
	getBuild: (buildId: string) => Promise<Build>
): Promise<string> {
	const sentences = await Promise.all(
		blocked.map(async ({ part, buildIds }) => {
			const builds = await blockingBuildLabels(buildIds, getBuild);
			const users = builds.length > 0 ? builds.join(', ') : 'a build';
			return `Can't remove ${part}: it's used by ${users}.`;
		})
	);
	return [...sentences, 'Change those builds first, or keep the part.'].join(' ');
}

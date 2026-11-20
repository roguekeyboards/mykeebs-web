import { ResponseError, type BuildInput } from '@roguekeyboards/mykeebs-api-client';

// Keyed by id, not mykeebs-api's index, so the flags survive edits to the form.
export type StaleBuildRefs = {
	keyboardId: string | null;
	switchIds: Set<string>;
	ecPartIds: Set<string>;
	kitKeys: Set<string>;
};

export const STALE_REFS_MESSAGE =
	'Some items are no longer in your collection. Remove them and save again.';

export const PARTS_MISMATCH_MESSAGE =
	'An EC build lists EC parts and no switches, and any other build lists switches and no EC parts. Check the build type and save again.';

export function kitKey(keycapSetId: string, kitId: string): string {
	return `${keycapSetId}/${kitId}`;
}

const SWITCH_FIELD = /^switches\[(\d+)\]\.switch$/;
const EC_PART_FIELD = /^ec_parts\[(\d+)\]\.ec_part$/;
const KIT_FIELD = /^keycap_kits\[(\d+)\]\.(?:kit|keycap_set)$/;

function entryAt<T>(pattern: RegExp, name: string, entries: T[] | undefined): T | undefined {
	const index = pattern.exec(name)?.[1];
	return index === undefined ? undefined : entries?.[Number(index)];
}

export function staleBuildRefs(
	input: BuildInput,
	invalidParams: { name: string }[]
): StaleBuildRefs | null {
	const refs: StaleBuildRefs = {
		keyboardId: null,
		switchIds: new Set(),
		ecPartIds: new Set(),
		kitKeys: new Set()
	};
	for (const { name } of invalidParams) {
		if (name === 'keyboard') {
			refs.keyboardId = input.keyboard;
			continue;
		}
		const sw = entryAt(SWITCH_FIELD, name, input.switches);
		if (sw) refs.switchIds.add(sw._switch);
		const part = entryAt(EC_PART_FIELD, name, input.ecParts);
		if (part) refs.ecPartIds.add(part.ecPart);
		const kit = entryAt(KIT_FIELD, name, input.keycapKits);
		if (kit) refs.kitKeys.add(kitKey(kit.keycapSet, kit.kit));
	}
	return refs.keyboardId || refs.switchIds.size || refs.ecPartIds.size || refs.kitKeys.size
		? refs
		: null;
}

async function invalidParams(err: unknown): Promise<{ name: string }[] | null> {
	if (!(err instanceof ResponseError) || err.response.status !== 400) return null;
	const body: unknown = await err.response
		.clone()
		.json()
		.catch(() => null);
	const params = (body as { invalid_params?: unknown } | null)?.invalid_params;
	if (!Array.isArray(params)) return null;
	return params.filter((p): p is { name: string } => typeof p?.name === 'string');
}

export async function buildSaveFailure(
	err: unknown,
	input: BuildInput,
	fallback: string
): Promise<{ staleRefs: StaleBuildRefs | null; message: string }> {
	const params = (await invalidParams(err)) ?? [];
	const staleRefs = staleBuildRefs(input, params);
	if (staleRefs) return { staleRefs, message: STALE_REFS_MESSAGE };
	const mismatch = params.some(({ name }) => name === 'switches' || name === 'ec_parts');
	return { staleRefs: null, message: mismatch ? PARTS_MISMATCH_MESSAGE : fallback };
}

import { ResponseError, type BuildInput } from '@roguekeyboards/mykeebs-api-client';

// Keyed by id, not mykeebs-api's index, so the flags survive edits to the form.
export type StaleBuildRefs = {
	keyboardId: string | null;
	switchIds: Set<string>;
	kitKeys: Set<string>;
};

export const STALE_REFS_MESSAGE =
	'Some items are no longer in your collection. Remove them and save again.';

export function kitKey(keycapSetId: string, kitId: string): string {
	return `${keycapSetId}/${kitId}`;
}

const SWITCH_FIELD = /^switches\[(\d+)\]\.switch$/;
const KIT_FIELD = /^keycap_kits\[(\d+)\]\.(?:kit|keycap_set)$/;

export function staleBuildRefs(
	input: BuildInput,
	invalidParams: { name: string }[]
): StaleBuildRefs | null {
	const refs: StaleBuildRefs = { keyboardId: null, switchIds: new Set(), kitKeys: new Set() };
	for (const { name } of invalidParams) {
		if (name === 'keyboard') {
			refs.keyboardId = input.keyboard;
			continue;
		}
		const switchIndex = SWITCH_FIELD.exec(name)?.[1];
		const sw = switchIndex === undefined ? undefined : input.switches?.[Number(switchIndex)];
		if (sw) {
			refs.switchIds.add(sw._switch);
			continue;
		}
		const kitIndex = KIT_FIELD.exec(name)?.[1];
		const kit = kitIndex === undefined ? undefined : input.keycapKits?.[Number(kitIndex)];
		if (kit) refs.kitKeys.add(kitKey(kit.keycapSet, kit.kit));
	}
	return refs.keyboardId || refs.switchIds.size > 0 || refs.kitKeys.size > 0 ? refs : null;
}

export async function staleBuildRefsFromError(
	err: unknown,
	input: BuildInput
): Promise<StaleBuildRefs | null> {
	if (!(err instanceof ResponseError) || err.response.status !== 400) return null;
	const body: unknown = await err.response
		.clone()
		.json()
		.catch(() => null);
	const params = (body as { invalid_params?: unknown } | null)?.invalid_params;
	if (!Array.isArray(params)) return null;
	return staleBuildRefs(
		input,
		params.filter((p): p is { name: string } => typeof p?.name === 'string')
	);
}

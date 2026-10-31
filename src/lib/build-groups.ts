import type { Build } from '@roguekeyboards/mykeebs-api-client';

export type KeyboardBuildGroup = {
	keyboardId: string;
	current: Build;
	// Every build of the keyboard, newest first, current included.
	builds: Build[];
	buildCount: number;
	mixedVisibility: boolean;
};

export function newestFirst(a: Build, b: Build): number {
	return (b.buildDate?.getTime() ?? 0) - (a.buildDate?.getTime() ?? 0);
}

export function groupByKeyboard(builds: Build[]): KeyboardBuildGroup[] {
	const groups = new Map<string, Build[]>();
	for (const build of builds) {
		const group = groups.get(build.keyboard.id);
		if (group) group.push(build);
		else groups.set(build.keyboard.id, [build]);
	}

	return [...groups].map(([keyboardId, groupBuilds]) => {
		const sorted = [...groupBuilds].sort(newestFirst);
		const current = sorted[0];
		return {
			keyboardId,
			current,
			builds: sorted,
			buildCount: sorted.length,
			mixedVisibility: sorted.some((build) => build.visibility !== current.visibility)
		};
	});
}

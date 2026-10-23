import { ProblemFromJSON, ResponseError, type Build } from '@rogueserenity/kbdb-api-client';
import { formatDate } from '#lib/format.js';

export async function blockingBuildIdsFromError(err: unknown): Promise<string[] | null> {
	if (!(err instanceof ResponseError) || err.response.status !== 409) return null;
	const body: unknown = await err.response
		.clone()
		.json()
		.catch(() => null);
	if (!body || typeof body !== 'object') return [];
	return ProblemFromJSON(body).blockingBuildIds ?? [];
}

export function blockingBuildLabel(build: Build): string {
	const date = formatDate(build.buildDate);
	return date ? `${build.keyboard.name} (${date})` : build.keyboard.name;
}

export function blockingBuildLabels(
	buildIds: string[],
	getBuild: (buildId: string) => Promise<Build>
): Promise<string[]> {
	return Promise.all(
		buildIds.map((buildId) => getBuild(buildId).then(blockingBuildLabel, () => 'a build'))
	);
}

export type DeleteFailure = { blockingBuilds: string[] } | { error: string };

export async function deleteFailure(
	err: unknown,
	getBuild: (buildId: string) => Promise<Build>,
	messages: { stillUsed: string; failed: string }
): Promise<DeleteFailure> {
	const buildIds = await blockingBuildIdsFromError(err);
	if (!buildIds) return { error: messages.failed };
	if (buildIds.length === 0) return { error: messages.stillUsed };
	return { blockingBuilds: await blockingBuildLabels(buildIds, getBuild) };
}

import type { Build } from '@rogueserenity/kbdb-api-client';
import { viewableImages } from './image-moderation';

export function primaryBuildImageUrl(build: Build): string | undefined {
	return viewableImages(build.images)[0]?.url;
}

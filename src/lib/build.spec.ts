import { describe, expect, it } from 'vitest';
import { ImageStatus, type Build } from '@rogueserenity/kbdb-api-client';
import { primaryBuildImageUrl } from './build';

function build(urls?: string[]): Build {
	return {
		id: 'b',
		keyboard: { id: 'kb', brand: 'Bowl', name: 'Manta' },
		images: urls?.map((url, i) => ({ imageId: `i${i}`, url }))
	};
}

describe('primaryBuildImageUrl', () => {
	it("is the build's first image", () => {
		expect(primaryBuildImageUrl(build(['first.png', 'second.png']))).toBe('first.png');
	});

	it('skips a rejected image, which has no url', () => {
		const b: Build = {
			...build(),
			images: [
				{ imageId: 'i0', status: ImageStatus.Rejected, rejectionReason: 'Explicit' },
				{ imageId: 'i1', url: 'second.png', status: ImageStatus.Pending }
			]
		};
		expect(primaryBuildImageUrl(b)).toBe('second.png');
	});

	it('is undefined for a build with no images', () => {
		expect(primaryBuildImageUrl(build([]))).toBeUndefined();
		expect(primaryBuildImageUrl(build())).toBeUndefined();
	});
});

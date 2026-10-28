<script lang="ts">
	import ImageViewer from '../ImageViewer.svelte';
	import { stepIndex } from '#lib/step-index.js';

	let {
		photos,
		stepping = true,
		stuck = false
	}: { photos: string[]; stepping?: boolean; stuck?: boolean } = $props();

	let index = $state(0);
	let refreshed = $state(false);
	const src = $derived(`${photos[index]}${refreshed ? '#refreshed' : ''}`);
</script>

<button type="button" onclick={() => (refreshed = true)}>Refresh url</button>
<button type="button" onclick={() => (index = stepIndex(index, 1, photos.length))}>
	Change photo
</button>
<ImageViewer
	open={true}
	{src}
	alt="Gallery"
	{index}
	count={photos.length}
	onClose={() => {}}
	onPrev={stepping ? () => (index = stepIndex(index, -1, photos.length)) : undefined}
	onNext={stepping
		? () => {
				if (!stuck) index = stepIndex(index, 1, photos.length);
			}
		: undefined}
/>

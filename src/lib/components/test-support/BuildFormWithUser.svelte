<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { setUserContext } from '#lib/user-context.js';
	import BuildForm from '../BuildForm.svelte';

	let { formProps }: { formProps: ComponentProps<typeof BuildForm> } = $props();

	let instance = $state<{ isDirty(): boolean } | null>(null);

	setUserContext({
		userId: 'user-1',
		username: 'tester',
		profile: { userId: 'user-1', username: 'tester', discoverable: true },
		isOwnProfile: true,
		showPrice: true
	});
</script>

<BuildForm {...formProps} bind:this={instance} />
<output data-testid="dirty">{instance?.isDirty() ?? false}</output>

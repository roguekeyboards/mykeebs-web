<script lang="ts">
	import type { Component } from 'svelte';
	import { setUserContext } from '#lib/user-context.js';

	let {
		component: Inner,
		isOwnProfile = true
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}: { component: Component<any>; isOwnProfile?: boolean } = $props();

	setUserContext({
		userId: 'user-1',
		username: 'rogue.serenity',
		profile: { userId: 'user-1', username: 'rogue.serenity', discoverable: true },
		get isOwnProfile() {
			return isOwnProfile;
		},
		showPrice: true
	});
</script>

<Inner />

<script lang="ts">
	import RootLayout from '../+layout.svelte';
	import UserLayout from '../u/[username]/+layout.svelte';
</script>

<RootLayout>
	<UserLayout>
		<p>Page content</p>
	</UserLayout>
</RootLayout>

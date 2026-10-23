<script lang="ts">
	import { auth, signIn } from './auth.svelte';
	import ProfileMenu from '#lib/components/ProfileMenu.svelte';
</script>

{#if auth.user}
	<ProfileMenu />
{:else if auth.status === 'signed-out'}
	<button type="button" class="btn btn-accent" onclick={signIn}>Sign in</button>
{/if}

<script lang="ts">
	import { resolve } from '$app/paths';
	import { PUBLIC_KBDB_API_BASE_PATH } from '$app/env/public';
	import { pageTitle } from '#lib/page-title.js';

	const supportEmail = 'support@mykeebs.com';
	const mcpHelpUrl = new URL('/help/mcp', PUBLIC_KBDB_API_BASE_PATH).href;
	const privacyUrl = new URL('/privacy', PUBLIC_KBDB_API_BASE_PATH).href;
</script>

<svelte:head><title>{pageTitle('Contact')}</title></svelte:head>

<div class="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12">
	<div>
		<h1 class="heading-lg text-3xl">Contact</h1>
		<p class="text-muted mt-3">
			Email <a href="mailto:{supportEmail}" class="underline">{supportEmail}</a> about anything to do
			with mykeebs.
		</p>
	</div>

	<section class="flex flex-col gap-2" aria-labelledby="contact-missing">
		<h2 id="contact-missing" class="section-label">Something missing from a list</h2>
		<p class="text-muted text-sm">
			Vendors, switch types, keyboard sizes and other fields only take values from a fixed list.
			Tell us what's missing.
		</p>
	</section>

	<section class="flex flex-col gap-2" aria-labelledby="contact-problems">
		<h2 id="contact-problems" class="section-label">Problems and ideas</h2>
		<p class="text-muted text-sm">
			Report a bug, ask a question or suggest a feature. For a bug, say what you were doing and
			which browser or device you were on.
		</p>
	</section>

	<section class="flex flex-col gap-2" aria-labelledby="contact-ai">
		<h2 id="contact-ai" class="section-label">AI assistants</h2>
		<p class="text-muted text-sm">
			To connect Claude or another assistant to your collection, see the
			<a href={mcpHelpUrl} rel="external" class="underline">guide to using mykeebs with AI</a>.
		</p>
	</section>

	<section class="flex flex-col gap-2" aria-labelledby="contact-data">
		<h2 id="contact-data" class="section-label">Your account and data</h2>
		<p class="text-muted text-sm">
			You can delete your whole account yourself from your
			<a href={resolve('/profile/edit')} class="underline">profile settings</a>. For anything else
			about your data, email us from the address on your Discord account so we can match it to your
			mykeebs account. The <a href={privacyUrl} rel="external" class="underline">privacy policy</a>
			lists what you can ask for.
		</p>
	</section>
</div>

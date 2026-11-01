import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import WithUserContext from '#lib/components/test-support/WithUserContext.svelte';
import OverviewPage from './+page.svelte';
import '../../layout.css';

vi.mock('#lib/api/client.js', () => {
	const empty = async () => ({ items: [] });
	return {
		keyboardsApi: { listKeyboards: empty },
		switchesApi: { listSwitches: empty },
		keycapSetsApi: { listKeycapSets: empty },
		buildsApi: { listBuilds: empty }
	};
});

const BIO = `Collector of odd layouts.\nMostly 40s.\nhttps://example.com/${'averylongpath'.repeat(20)}`;

beforeEach(async () => {
	await page.viewport(320, 640);
});
afterEach(async () => {
	await page.viewport(414, 896);
});

it('keeps the line breaks in a bio and wraps a long URL within a phone screen', async () => {
	await render(WithUserContext, { component: OverviewPage, bio: BIO });

	const bio = page.getByText(/^Collector of odd layouts/);
	await expect.element(bio).toBeInTheDocument();
	const element = bio.element() as HTMLElement;

	expect(element.innerText).toBe(BIO);
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
	expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
});

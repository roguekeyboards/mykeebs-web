import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Layout from './+layout.svelte';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/discover') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('#lib/auth/auth.svelte.js', () => ({
	initAuth: vi.fn(async () => {}),
	signIn: vi.fn(),
	signOut: vi.fn(),
	auth: { status: 'signed-out', user: null }
}));
vi.mock('#lib/profile/profile.svelte.js', () => ({
	initProfile: vi.fn(),
	profile: { status: 'idle', data: null }
}));
vi.mock('#lib/api/client.js', () => ({ profilesApi: { listProfiles: vi.fn() } }));

const content = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));

async function renderLayout() {
	await render(Layout, { children: content });
}

describe('root layout', () => {
	it('puts the page content inside the main landmark', async () => {
		await renderLayout();

		await expect.element(page.getByRole('main')).toHaveTextContent('Page content');
	});

	it('offers a skip link as the first stop, and it moves focus to the content', async () => {
		await renderLayout();
		const skip = page.getByRole('link', { name: 'Skip to content' });

		await userEvent.keyboard('{Tab}');
		await expect.element(skip).toHaveFocus();
		await userEvent.keyboard('{Enter}');

		await expect.element(page.getByRole('main')).toHaveFocus();
	});

	it('names the site navigation and marks the current page', async () => {
		await page.viewport(1024, 768);
		try {
			await renderLayout();

			await expect
				.element(
					page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Discover' })
				)
				.toHaveAttribute('aria-current', 'page');
		} finally {
			await page.viewport(414, 896);
		}
	});

	it("links mykeebs.com's landing page, MCP guide, AI statement, legal pages and contact page from the footer", async () => {
		await renderLayout();
		const footer = page.getByRole('contentinfo');

		for (const [name, href] of [
			['About mykeebs', 'https://mykeebs.com/'],
			['Use with AI Assistants', 'https://mykeebs.com/help/mcp'],
			['How We Use AI', 'https://mykeebs.com/about/ai'],
			['Privacy Policy', 'https://mykeebs.com/privacy'],
			['Terms of Service', 'https://mykeebs.com/terms'],
			['Contact', 'https://mykeebs.com/contact']
		]) {
			await expect.element(footer.getByRole('link', { name })).toHaveAttribute('href', href);
		}
	});

	it('shows the square brand mark on small screens and the wide logo from sm up', async () => {
		const brandShape = () => {
			const box = page.getByRole('img', { name: 'mykeebs' }).element().getBoundingClientRect();
			return box.width / box.height;
		};
		await page.viewport(390, 844);
		try {
			await renderLayout();
			await vi.waitFor(() => expect(brandShape()).toBeCloseTo(1, 0));

			await page.viewport(1024, 768);
			await vi.waitFor(() => expect(brandShape()).toBeGreaterThan(3));
		} finally {
			await page.viewport(414, 896);
		}
	});

	it("uses the brand's favicons and touch icon", async () => {
		await renderLayout();

		const href = (selector: string) =>
			document.head.querySelector<HTMLLinkElement>(selector)?.getAttribute('href') ?? '';
		await vi.waitFor(() => {
			expect(href('link[rel="icon"][type="image/svg+xml"]')).toMatch(
				/favicon\.svg|^data:image\/svg/
			);
			expect(href('link[rel="icon"][sizes="32x32"]')).toMatch(/favicon\.ico|^data:image/);
			expect(href('link[rel="apple-touch-icon"]')).toMatch(
				/apple-touch-icon\.png|^data:image\/png/
			);
		});
	});
});

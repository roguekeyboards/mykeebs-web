import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { brandIcons, brandIconsPlugin } from './brand-icons';

const names = Object.keys(brandIcons);
const brandFile = (name: string) =>
	readFileSync(createRequire(import.meta.url).resolve(`@roguekeyboards/mykeebs-brand/${name}`));

type Hook = (this: unknown, ...args: unknown[]) => void;

describe('brand icons', () => {
	it('are linked from app.html at the site root', () => {
		const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
		for (const name of names) expect(html).toContain(`href="%sveltekit.assets%/${name}"`);
	});

	it('are emitted at the root of the client build', () => {
		const emitFile = vi.fn();
		const generateBundle = brandIconsPlugin().generateBundle as Hook;
		generateBundle.call({ environment: { name: 'client' }, emitFile });

		expect(emitFile.mock.calls.map(([file]) => file)).toEqual(
			names.map((fileName) => ({ type: 'asset', fileName, source: brandFile(fileName) }))
		);
	});

	it('are not emitted by the server build', () => {
		const emitFile = vi.fn();
		const generateBundle = brandIconsPlugin().generateBundle as Hook;
		generateBundle.call({ environment: { name: 'ssr' }, emitFile });

		expect(emitFile).not.toHaveBeenCalled();
	});

	describe('in dev', () => {
		function middleware() {
			const use = vi.fn();
			(brandIconsPlugin().configureServer as Hook)({ middlewares: { use } });
			return use.mock.calls[0][0] as (req: unknown, res: unknown, next: () => void) => void;
		}

		it.each(names)('serve /%s from the brand package', (name) => {
			const res = { setHeader: vi.fn(), end: vi.fn() };
			const next = vi.fn();
			middleware()({ url: `/${name}?v=1` }, res, next);

			expect(res.setHeader).toHaveBeenCalledWith('Content-Type', brandIcons[name]);
			expect(res.end).toHaveBeenCalledWith(brandFile(name));
			expect(next).not.toHaveBeenCalled();
		});

		it('pass other requests on', () => {
			const res = { setHeader: vi.fn(), end: vi.fn() };
			const next = vi.fn();
			middleware()({ url: '/discover/favicon.svg' }, res, next);

			expect(next).toHaveBeenCalled();
			expect(res.end).not.toHaveBeenCalled();
		});
	});
});

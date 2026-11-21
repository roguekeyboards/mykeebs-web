import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

export const brandIcons: Record<string, string> = {
	'favicon.ico': 'image/x-icon',
	'favicon.svg': 'image/svg+xml',
	'apple-touch-icon.png': 'image/png'
};

const require = createRequire(import.meta.url);

function readIcon(name: string): Buffer {
	return readFileSync(require.resolve(`@roguekeyboards/mykeebs-brand/${name}`));
}

export function brandIconsPlugin(): Plugin {
	return {
		name: 'mykeebs-brand-icons',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const name = req.url?.split('?')[0].slice(1) ?? '';
				const type = brandIcons[name];
				if (!type) return next();
				res.setHeader('Content-Type', type);
				res.end(readIcon(name));
			});
		},
		generateBundle() {
			if (this.environment.name !== 'client') return;
			for (const fileName of Object.keys(brandIcons)) {
				this.emitFile({ type: 'asset', fileName, source: readIcon(fileName) });
			}
		}
	};
}

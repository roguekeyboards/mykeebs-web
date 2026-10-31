import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(ts|svelte)$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name)
			? [path]
			: [];
	});
}

function envKeys(source: string): string[] {
	return [...source.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(([, key]) => key).sort();
}

describe('env vars', () => {
	const used = [
		...new Set(
			sourceFiles(join(root, 'src')).flatMap((file) =>
				[...readFileSync(file, 'utf8').matchAll(/\b(?:PUBLIC|MYKEEBS)_[A-Z_]+\b/g)].map(
					([name]) => name
				)
			)
		)
	].sort();

	it('are found', () => {
		expect(used.length).toBeGreaterThan(0);
	});

	it.each(['.env.dev', '.env.prod', '.env.example'])('are exactly the ones %s defines', (file) => {
		expect(envKeys(read(file))).toEqual(used);
	});
});

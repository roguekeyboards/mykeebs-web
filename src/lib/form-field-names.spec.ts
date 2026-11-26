import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

// Attribute expressions can contain `>` (arrow functions, comparisons), so a
// tag ends at the first `>` outside braces and quotes.
function fieldTags(source: string): string[] {
	return [...source.matchAll(/<(input|select|textarea)\b/g)].map(({ index }) => {
		let depth = 0;
		let quote: string | null = null;
		for (let i = index; i < source.length; i++) {
			const c = source[i];
			if (quote) {
				if (c === quote) quote = null;
			} else if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (depth === 0 && (c === '"' || c === "'")) quote = c;
			else if (depth === 0 && c === '>') return source.slice(index, i + 1);
		}
		return source.slice(index);
	});
}

const hasIdOrName = (tag: string) => /\s((id|name)=|\{(id|name)\})/.test(tag);

describe('fieldTags', () => {
	it('reads past `>` inside attribute expressions', () => {
		const [tag] = fieldTags('<input onchange={(e) => (n = a > b)} name="x" /><p>');
		expect(tag).toBe('<input onchange={(e) => (n = a > b)} name="x" />');
		expect(hasIdOrName(tag)).toBe(true);
	});

	it('counts the {name} shorthand as a name', () => {
		expect(hasIdOrName('<input {name} type="date" />')).toBe(true);
	});

	it('does not mistake data-name or aria-labelledby for a name or id', () => {
		const [tag] = fieldTags('<input data-name="x" aria-labelledby="y" />');
		expect(hasIdOrName(tag)).toBe(false);
	});
});

describe('form fields', () => {
	const tags = svelteFiles(root).flatMap((file) =>
		fieldTags(readFileSync(file, 'utf8')).map((tag) => ({ file: relative(root, file), tag }))
	);

	it('are found', () => {
		expect(tags.length).toBeGreaterThan(50);
	});

	it('all have an id or name, so Chrome does not flag them for autofill', () => {
		const unnamed = tags
			.filter(({ tag }) => !hasIdOrName(tag))
			.map(({ file, tag }) => `${file}: ${tag.replace(/\s+/g, ' ')}`);

		expect(unnamed).toEqual([]);
	});
});

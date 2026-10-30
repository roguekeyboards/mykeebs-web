import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const css = [
	createRequire(import.meta.url).resolve('@roguekeyboards/mykeebs-brand/tokens.css'),
	new URL('../routes/layout.css', import.meta.url)
]
	.map((path) => readFileSync(path, 'utf8'))
	.join('\n');

const tokens = Object.fromEntries(
	[...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name, hex])
);

type Rgb = [number, number, number];

function resolve(value: string): Rgb {
	const hex = value.startsWith('var(') ? tokens[value.slice(6, -1)] : value;
	if (!hex) throw new Error(`unknown color ${value}`);
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
	const [lr, lg, lb] = [r, g, b].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

function tint(color: Rgb, share: number, under: Rgb): Rgb {
	return color.map((c, i) => c * share + under[i] * (1 - share)) as Rgb;
}

const backgrounds = ['bg', 'bg-raised', 'surface', 'surface-hover'];
const AA_TEXT = 4.5;

describe('text colors', () => {
	const textTokens = ['text', 'text-muted', 'text-faint', 'danger', 'accent', 'warning', 'info'];

	it.each(textTokens.flatMap((fg) => backgrounds.map((bg) => [fg, bg])))(
		'--%s on --%s meets WCAG AA for normal text',
		(fg, bg) => {
			expect(contrast(resolve(`var(--${fg})`), resolve(`var(--${bg})`))).toBeGreaterThanOrEqual(
				AA_TEXT
			);
		}
	);
});

describe('labelled badges on their own tint', () => {
	const labelled = [
		'.status-planned',
		'.status-ordered',
		'.status-shipped',
		'.status-delivered',
		'.status-cancelled',
		'.status-default',
		'.visibility-picker-btn-active.visibility-public',
		'.visibility-picker-btn-active.visibility-authenticated',
		'.visibility-picker-btn-active.visibility-private'
	];

	function badge(selector: string) {
		const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const block = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1];
		if (!block) throw new Error(`no CSS block for ${selector}`);
		const color = block.match(/(?:^|\n)\s*color:\s*([^;]+);/)?.[1].trim();
		const bg = block.match(/background:\s*color-mix\(in srgb,\s*([^ ]+)\s+(\d+)%/);
		if (!color || !bg) throw new Error(`unexpected CSS for ${selector}`);
		return { color: resolve(color), tint: resolve(bg[1]), share: Number(bg[2]) / 100 };
	}

	it.each(labelled.flatMap((selector) => backgrounds.map((bg) => [selector, bg])))(
		'%s on --%s meets WCAG AA for normal text',
		(selector, bg) => {
			const { color, tint: tintColor, share } = badge(selector);
			const under = tint(tintColor, share, resolve(`var(--${bg})`));
			expect(contrast(color, under)).toBeGreaterThanOrEqual(AA_TEXT);
		}
	);
});

describe('select chevron', () => {
	const stroke = css.match(/stroke='%23([0-9a-f]{6})'/i)?.[1];

	it('uses the faint text color, since a CSS variable cannot reach inside the inline SVG', () => {
		expect(`#${stroke}`).toBe(tokens['text-faint']);
	});

	it('meets the 3:1 non-text contrast minimum on the field background', () => {
		expect(contrast(resolve(`#${stroke}`), resolve('var(--bg-raised)'))).toBeGreaterThanOrEqual(3);
	});
});

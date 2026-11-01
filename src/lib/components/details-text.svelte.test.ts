import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BuildDetails from './BuildDetails.svelte';
import KeyboardDetails from './KeyboardDetails.svelte';
import KeycapKitDetails from './KeycapKitDetails.svelte';
import KeycapSetDetails from './KeycapSetDetails.svelte';
import SwitchDetails from './SwitchDetails.svelte';
import DetailsInModal from './test-support/DetailsInModal.svelte';
import '../../routes/layout.css';

const LONG_NAME = 'Ab cd ef gh ij kl mn op qr st uv wx yz '.repeat(3).trim();
const LONG_URL = `https://example.com/${'averylongpath'.repeat(20)}`;
const NOTES = `First line\nSecond line\n${LONG_URL}`;
const LONG_VALUE = 'Navy Blue Anodized Aluminum With A Brass Weight And A Long Description';
const UNBROKEN_VALUE = 'x'.repeat(120);
const IMAGE =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const noop = () => {};

const CASES = [
	[
		'keyboard',
		KeyboardDetails,
		{
			keyboard: {
				id: 'k',
				brand: 'KBDFans',
				name: LONG_NAME,
				notes: NOTES,
				design: { topCase: { material: LONG_VALUE, color: 'Navy' } }
			},
			onImageClick: noop,
			showPrice: true
		}
	],
	[
		'switch',
		SwitchDetails,
		{
			sw: {
				id: 's',
				brand: 'HMX',
				name: LONG_NAME,
				notes: NOTES,
				image: { imageId: 'i', url: IMAGE },
				material: { stem: LONG_VALUE }
			},
			onImageClick: noop,
			showPrice: true
		}
	],
	[
		'keycap set',
		KeycapSetDetails,
		{
			set: { id: 'set', brand: 'GMK', name: LONG_NAME, notes: NOTES, kits: [] },
			failedImages: new Set<string>(),
			onImageError: noop,
			onKitClick: noop,
			showPrice: true
		}
	],
	[
		'build',
		BuildDetails,
		{
			build: {
				id: 'b',
				notes: NOTES,
				keyboard: { id: 'kb', brand: 'Bowl', name: LONG_NAME, imageUrl: IMAGE },
				plate: { id: 'p', material: LONG_VALUE }
			},
			onKeyboardClick: noop,
			onSwitchClick: noop,
			onKeycapKitClick: noop,
			onImageClick: noop,
			showPrice: true
		}
	]
] as const;

function withName(props: (typeof CASES)[number][2], name: string): Record<string, unknown> {
	if ('keyboard' in props) return { ...props, keyboard: { ...props.keyboard, name } };
	if ('sw' in props) return { ...props, sw: { ...props.sw, name } };
	if ('set' in props) return { ...props, set: { ...props.set, name } };
	return { ...props, build: { ...props.build, keyboard: { ...props.build.keyboard, name } } };
}

function panel(): HTMLElement {
	return page.getByRole('dialog').element() as HTMLElement;
}

function title(): HTMLElement {
	return panel().querySelector('h2') as HTMLElement;
}

function headerControls(): Element[] {
	return [...panel().querySelector('.absolute')!.children];
}

function textLines(element: Element): DOMRect[] {
	const range = document.createRange();
	range.selectNodeContents(element);
	return [...range.getClientRects()];
}

function collisions(lines: DOMRect[], boxes: Element[]): number {
	return lines.filter((line) =>
		boxes.some((el) => {
			const box = el.getBoundingClientRect();
			return (
				line.left < box.right &&
				line.right > box.left &&
				line.top < box.bottom &&
				line.bottom > box.top
			);
		})
	).length;
}

function expectNoSidewaysScroll() {
	const scroller = panel();
	expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
}

describe('text in the details modals', () => {
	describe('on a narrow phone', () => {
		beforeEach(async () => {
			await page.viewport(320, 640);
		});
		afterEach(async () => {
			await page.viewport(414, 896);
		});

		it.each(CASES)('%s notes keep their line breaks', async (_, details, detailsProps) => {
			await render(DetailsInModal, { details, detailsProps });

			const notes = page.getByText(/^First line/);
			await expect.element(notes).toBeInTheDocument();
			expect((notes.element() as HTMLElement).innerText).toBe(NOTES);
		});

		it.each(CASES)("%s details don't scroll sideways", async (_, details, detailsProps) => {
			await render(DetailsInModal, { details, detailsProps });
			await expect.element(page.getByText(/^First line/)).toBeInTheDocument();

			expectNoSidewaysScroll();
		});

		it.each(CASES)("%s title doesn't run under the badge", async (_, details, detailsProps) => {
			await render(DetailsInModal, { details, detailsProps });

			await vi.waitFor(() => {
				expect(textLines(title()).length).toBeGreaterThan(1);
				expect(collisions(textLines(title()), headerControls())).toBe(0);
			});
		});

		it.each(CASES)('%s title has room for its words', async (_, details, detailsProps) => {
			const name = 'Novelkeys Cream';
			const props = withName(detailsProps, name);
			await render(DetailsInModal, { details, detailsProps: props });

			const heading = page.getByRole('heading', { name });
			await expect.element(heading).toBeInTheDocument();
			expect(textLines(heading.element()).length).toBeLessThanOrEqual(2);
		});

		it.each(CASES)(
			"%s brand and notes don't run under the badge",
			async (_, details, detailsProps) => {
				await render(DetailsInModal, { details, detailsProps });

				await vi.waitFor(() => {
					const below = [...panel().querySelectorAll('p')].flatMap(textLines);
					expect(below.length).toBeGreaterThan(0);
					expect(collisions(below, headerControls())).toBe(0);
				});
			}
		);

		it('wraps a long spec value, right-aligned beside its label', async () => {
			await render(DetailsInModal, {
				details: KeyboardDetails,
				detailsProps: {
					keyboard: {
						id: 'k',
						brand: 'KBDFans',
						name: 'Agar',
						design: { topCase: { material: LONG_VALUE } }
					},
					onImageClick: noop,
					showPrice: true
				}
			});

			const value = page.getByText(LONG_VALUE);
			await expect.element(value).toBeInTheDocument();
			const element = value.element();
			expect(textLines(element).length).toBeGreaterThan(1);
			expect(getComputedStyle(element).textAlign).toBe('right');
			expect(element.getBoundingClientRect().left).toBeGreaterThan(
				page.getByText('Top case').element().getBoundingClientRect().left
			);
			expectNoSidewaysScroll();
		});

		it("doesn't scroll sideways for a spec value with nowhere to break", async () => {
			await render(DetailsInModal, {
				details: KeyboardDetails,
				detailsProps: {
					keyboard: {
						id: 'k',
						brand: 'KBDFans',
						name: 'Agar',
						design: { topCase: { material: UNBROKEN_VALUE } }
					},
					onImageClick: noop,
					showPrice: true
				}
			});

			await expect.element(page.getByText(UNBROKEN_VALUE)).toBeInTheDocument();
			expectNoSidewaysScroll();
		});
	});

	describe('on a wide screen', () => {
		beforeEach(async () => {
			await page.viewport(800, 768);
		});
		afterEach(async () => {
			await page.viewport(414, 896);
		});

		it("doesn't run a kit's name under the previous and next buttons", async () => {
			await render(DetailsInModal, {
				details: KeycapKitDetails,
				kitArrows: true,
				detailsProps: {
					name: LONG_NAME,
					image: undefined,
					imageFailed: false,
					onImageError: noop,
					onImageClick: noop,
					purchase: undefined,
					showPrice: true
				}
			});

			await vi.waitFor(() => {
				expect(textLines(title()).length).toBeGreaterThan(1);
				expect(collisions(textLines(title()), headerControls())).toBe(0);
			});
		});
	});
});

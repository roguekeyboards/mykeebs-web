import { cdp, page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImageViewer from './ImageViewer.svelte';
import '../../routes/layout.css';

const base = { open: true, src: 'https://img.example/1.png', alt: 'Neo65 Cu', onClose: () => {} };

// Tall enough to move both ways once zoomed, in the default 414×896 viewport.
async function largeImage(): Promise<string> {
	const canvas = new OffscreenCanvas(1000, 2000);
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#36c';
	ctx.fillRect(0, 0, 1000, 2000);
	return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
}

async function renderLoaded(props: Record<string, unknown> = {}) {
	await render(ImageViewer, { ...base, src: await largeImage(), ...props });
	const img = document.querySelector<HTMLImageElement>('img')!;
	await vi.waitFor(() => expect(img.complete && img.naturalWidth > 0).toBe(true));
	return img;
}

const zoomLevel = () => page.getByRole('button', { name: 'Reset zoom' });
const offset = (img: HTMLImageElement) => {
	const [, x, y] = img.style.transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/)!;
	return [Number(x), Number(y)];
};
const limit = (img: HTMLImageElement, scale: number) => {
	const stage = img.parentElement!;
	return [
		(img.offsetWidth * scale - stage.clientWidth) / 2,
		(img.offsetHeight * scale - stage.clientHeight) / 2
	];
};

describe('ImageViewer.svelte arrows', () => {
	it('names the arrows for photos by default and steps with them', async () => {
		const onPrev = vi.fn();
		const onNext = vi.fn();
		await render(ImageViewer, { ...base, onPrev, onNext });

		await page.getByRole('button', { name: 'Previous photo' }).click();
		await page.getByRole('button', { name: 'Next photo' }).click();

		expect(onPrev).toHaveBeenCalledOnce();
		expect(onNext).toHaveBeenCalledOnce();
	});

	it('names the arrows after what is being browsed', async () => {
		await render(ImageViewer, { ...base, itemLabel: 'kit', onPrev: () => {}, onNext: () => {} });

		await expect.element(page.getByRole('button', { name: 'Previous kit' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Next kit' })).toBeInTheDocument();
	});

	it('shows no arrows when there is nothing to step to', async () => {
		await render(ImageViewer, base);

		await expect.element(page.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /^(Previous|Next) / }))
			.not.toBeInTheDocument();
	});
});

describe('ImageViewer.svelte position', () => {
	it('shows a pip per photo with the current one filled, and announces the position', async () => {
		await render(ImageViewer, { ...base, index: 2, count: 4, onPrev: () => {}, onNext: () => {} });

		const pips = [...page.getByTestId('pips').element().children];
		expect(pips.map((pip) => pip.classList.contains('bg-white'))).toEqual([
			false,
			false,
			true,
			false
		]);
		expect(page.getByTestId('pips').element().getAttribute('aria-hidden')).toBe('true');
		await expect.element(page.getByText('Photo 3 of 4')).toBeInTheDocument();
		await expect.element(page.getByRole('dialog')).toHaveAccessibleDescription('Photo 3 of 4');
	});

	it('names the position after what is being browsed', async () => {
		await render(ImageViewer, { ...base, itemLabel: 'kit', index: 1, count: 3 });

		await expect.element(page.getByText('Kit 2 of 3')).toBeInTheDocument();
	});

	it('shows no pips for a single photo', async () => {
		await render(ImageViewer, base);

		await expect.element(page.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		await expect.element(page.getByTestId('pips')).not.toBeInTheDocument();
		await expect.element(page.getByRole('dialog')).not.toHaveAccessibleDescription();
		await expect.element(page.getByText(/of 1$/)).not.toBeInTheDocument();
	});
});

describe('ImageViewer.svelte touch', () => {
	beforeEach(async () => {
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
	});

	afterEach(async () => {
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	});

	// Real touches through the browser, in the test iframe's (scaled) coordinates, as offsets
	// from the middle of the viewer.
	function touchPoints(points: [number, number][]) {
		const frame = window.frameElement!.getBoundingClientRect();
		const k = frame.width / window.innerWidth;
		return points.map(([dx, dy], id) => ({
			x: frame.x + (window.innerWidth / 2 + dx) * k,
			y: frame.y + (window.innerHeight / 2 + dy) * k,
			id
		}));
	}

	async function gesture(...steps: [number, number][][]) {
		const [first, ...rest] = steps;
		await cdp().send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: touchPoints(first)
		});
		for (const step of rest) {
			await cdp().send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: touchPoints(step)
			});
		}
		await cdp().send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	}

	it('steps to the next photo on a swipe left and the previous on a swipe right', async () => {
		const onPrev = vi.fn();
		const onNext = vi.fn();
		await render(ImageViewer, { ...base, onPrev, onNext });

		await gesture([[60, 0]], [[-60, 5]]);
		await vi.waitFor(() => expect(onNext).toHaveBeenCalledOnce());
		await gesture([[-60, 0]], [[60, -5]]);
		await vi.waitFor(() => expect(onPrev).toHaveBeenCalledOnce());
		expect(onNext).toHaveBeenCalledOnce();
	});

	it('swipes from on top of the pips too', async () => {
		const onNext = vi.fn();
		await render(ImageViewer, { ...base, index: 0, count: 3, onPrev: () => {}, onNext });
		const pips = page.getByTestId('pips').element().getBoundingClientRect();
		const dx = pips.x + pips.width / 2 - window.innerWidth / 2;
		const dy = pips.y + pips.height / 2 - window.innerHeight / 2;

		await gesture([[dx, dy]], [[dx - 120, dy]]);

		await vi.waitFor(() => expect(onNext).toHaveBeenCalledOnce());
	});

	it('ignores a short or mostly vertical swipe', async () => {
		const onPrev = vi.fn();
		const onNext = vi.fn();
		await render(ImageViewer, { ...base, onPrev, onNext });

		await gesture([[20, 0]], [[-20, 0]]);
		await gesture([[0, -80]], [[-60, 80]]);
		await expect.element(page.getByRole('button', { name: 'Close' })).toBeInTheDocument();

		expect(onPrev).not.toHaveBeenCalled();
		expect(onNext).not.toHaveBeenCalled();
	});

	it('zooms with a pinch, back to 100% when pinched closed', async () => {
		await render(ImageViewer, base);

		await gesture(
			[
				[-50, 0],
				[50, 0]
			],
			[
				[-100, 0],
				[100, 0]
			]
		);
		await expect.element(zoomLevel()).toHaveTextContent('200%');

		await gesture(
			[
				[-100, 0],
				[100, 0]
			],
			[
				[-20, 0],
				[20, 0]
			]
		);
		await expect.element(zoomLevel()).toHaveTextContent('100%');
	});

	it('moves a zoomed photo with one finger instead of changing photo, stopping at its edge', async () => {
		const onNext = vi.fn();
		const img = await renderLoaded({ onPrev: () => {}, onNext });
		await userEvent.keyboard('+++');
		await expect.element(zoomLevel()).toHaveTextContent('250%');

		await gesture([[30, 30]], [[0, 0]]);
		await vi.waitFor(() => expect(offset(img)).toEqual([-30, -30]));

		await gesture([[0, 0]], [[-2000, -2000]]);
		await vi.waitFor(() => expect(offset(img)[0]).toBeCloseTo(-limit(img, 2.5)[0], 0));
		expect(offset(img)[1]).toBeCloseTo(-limit(img, 2.5)[1], 0);
		expect(onNext).not.toHaveBeenCalled();
	});

	it('pulls a moved photo back into view when pinched smaller', async () => {
		const img = await renderLoaded();
		await userEvent.keyboard('+++');
		await gesture([[0, 0]], [[-2000, 0]]);
		await vi.waitFor(() => expect(offset(img)[0]).toBeCloseTo(-limit(img, 2.5)[0], 0));

		await gesture(
			[
				[-100, 0],
				[100, 0]
			],
			[
				[-60, 0],
				[60, 0]
			]
		);

		await expect.element(zoomLevel()).toHaveTextContent('150%');
		expect(offset(img)[0]).toBeCloseTo(-limit(img, 1.5)[0], 0);
	});

	it('follows the fingers without easing while they are down', async () => {
		const img = await renderLoaded();
		expect(img.style.transition).toContain('transform');

		await cdp().send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: touchPoints([
				[-50, 0],
				[50, 0]
			])
		});
		await vi.waitFor(() => expect(img.style.transition).toBe('none'));
		await cdp().send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await vi.waitFor(() => expect(img.style.transition).toContain('transform'));
	});

	it('starts a pinch from fingers that land on the same spot', async () => {
		await render(ImageViewer, base);

		await gesture(
			[
				[0, 0],
				[0, 0]
			],
			[
				[-50, 0],
				[50, 0]
			],
			[
				[-100, 0],
				[100, 0]
			]
		);

		await vi.waitFor(() => expect(zoomLevel().element().textContent).toMatch(/[2-6]\d\d%/));
	});

	it('gives touch hints on a touch screen', async () => {
		await render(ImageViewer, base);

		await expect.element(page.getByText('Pinch to zoom')).toBeInTheDocument();
		await userEvent.keyboard('+');
		await expect.element(page.getByText('Drag to move')).toBeInTheDocument();
	});
});

describe('ImageViewer.svelte motion', () => {
	beforeEach(async () => {
		// Slowed down so the 120ms transitions are still running when we look.
		await cdp().send('Animation.setPlaybackRate', { playbackRate: 0.01 });
	});

	afterEach(async () => {
		await cdp().send('Animation.setPlaybackRate', { playbackRate: 1 });
	});

	const transition = (element: Element) =>
		element.getAnimations().find((animation) => Number(animation.effect!.getTiming().duration) > 0);
	const firstFrame = (element: Element) =>
		(transition(element)?.effect as KeyframeEffect | undefined)?.getKeyframes()[0];
	const photo = () => document.querySelector<HTMLImageElement>('img')!;

	it('fades in when opened', async () => {
		const { rerender } = await render(ImageViewer, { ...base, open: false });

		await rerender({ ...base, open: true });

		const dialog = page.getByRole('dialog').element();
		await vi.waitFor(() => expect(transition(dialog)).toBeDefined());
		expect(Number(firstFrame(dialog)?.opacity)).toBeCloseTo(0);
		expect(transition(dialog)?.effect!.getTiming().duration).toBe(120);
	});

	it('slides the next photo in from the right and the previous from the left', async () => {
		const props = { ...base, onPrev: () => {}, onNext: () => {} };
		const { rerender } = await render(ImageViewer, props);
		expect(photo().getAnimations()).toEqual([]);

		await page.getByRole('button', { name: 'Next photo' }).click();
		await rerender({ ...props, src: 'https://img.example/2.png' });
		await vi.waitFor(() => expect(transition(photo())).toBeDefined());
		expect(firstFrame(photo())?.transform).toContain('translate(80px, 0px)');

		await page.getByRole('button', { name: 'Previous photo' }).click();
		await rerender({ ...props, src: 'https://img.example/1.png' });
		await vi.waitFor(() => expect(transition(photo())).toBeDefined());
		expect(firstFrame(photo())?.transform).toContain('translate(-80px, 0px)');
	});
});

describe('ImageViewer.svelte as a dialog', () => {
	it('is a dialog named after the photo, with focus on Close', async () => {
		await render(ImageViewer, base);

		await expect
			.element(page.getByRole('dialog', { name: 'Neo65 Cu, full size' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Close' })).toHaveFocus();
	});

	it('keeps Tab inside the viewer, wrapping at both ends', async () => {
		await render(ImageViewer, { ...base, onPrev: () => {}, onNext: () => {} });
		await expect.element(page.getByRole('button', { name: 'Close' })).toHaveFocus();

		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		await expect.element(page.getByRole('button', { name: 'Next photo' })).toHaveFocus();

		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByRole('button', { name: 'Close' })).toHaveFocus();
	});

	it('returns focus to whatever was focused before it opened', async () => {
		const opener = document.createElement('button');
		opener.textContent = 'Open photo';
		document.body.append(opener);
		onTestFinished(() => opener.remove());
		opener.focus();
		const { rerender } = await render(ImageViewer, { ...base, open: false });

		await rerender({ ...base, open: true });
		await expect.element(page.getByRole('button', { name: 'Close' })).toHaveFocus();
		await rerender({ ...base, open: false });

		expect(document.activeElement).toBe(opener);
	});
});

describe('ImageViewer.svelte keyboard zoom and pan', () => {
	it('zooms with + and -, and resets with 0', async () => {
		await renderLoaded();

		await userEvent.keyboard('++');
		await expect.element(zoomLevel()).toHaveTextContent('200%');
		await userEvent.keyboard('-');
		await expect.element(zoomLevel()).toHaveTextContent('150%');
		await userEvent.keyboard('0');
		await expect.element(zoomLevel()).toHaveTextContent('100%');
	});

	it('steps between photos with the arrows until zoomed, then moves the photo instead', async () => {
		const onNext = vi.fn();
		const img = await renderLoaded({ onNext, onPrev: () => {} });
		await expect.element(page.getByText('Scroll to zoom')).toBeInTheDocument();

		await userEvent.keyboard('{ArrowRight}');
		expect(onNext).toHaveBeenCalledOnce();

		await userEvent.keyboard('+{ArrowRight}{ArrowDown}');

		expect(onNext).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(offset(img)).toEqual([-50, -50]));
		await expect.element(page.getByText('Arrow keys or drag to move')).toBeInTheDocument();
	});

	it('moves further with Shift held, and stops at the edge of the photo', async () => {
		const img = await renderLoaded();
		await userEvent.keyboard('+');

		await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
		await vi.waitFor(() => expect(offset(img)[0]).toBeGreaterThan(50));

		for (let i = 0; i < 40; i++) await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
		expect(offset(img)[0]).toBeCloseTo(limit(img, 1.5)[0], 0);
	});
});

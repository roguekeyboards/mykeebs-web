import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImageViewer from './ImageViewer.svelte';

const base = { open: true, src: 'https://img.example/1.png', alt: 'Neo65 Cu', onClose: () => {} };

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
		opener.focus();
		const { rerender } = await render(ImageViewer, { ...base, open: false });

		await rerender({ ...base, open: true });
		await expect.element(page.getByRole('button', { name: 'Close' })).toHaveFocus();
		await rerender({ ...base, open: false });

		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
});

describe('ImageViewer.svelte keyboard zoom and pan', () => {
	async function largeImage(): Promise<string> {
		const canvas = new OffscreenCanvas(2000, 1500);
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#36c';
		ctx.fillRect(0, 0, 2000, 1500);
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
		const stage = img.parentElement!;
		const limit = (img.offsetWidth * 1.5 - stage.clientWidth) / 2;
		expect(offset(img)[0]).toBeCloseTo(limit, 0);
	});
});

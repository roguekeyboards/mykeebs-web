import { cdp, page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ModalHarness from './test-support/ModalHarness.svelte';
import '../../routes/layout.css';

async function openModal(props: Record<string, unknown> = {}) {
	const onClose = vi.fn();
	await render(ModalHarness, { onClose, ...props });
	await page.getByRole('button', { name: 'Open' }).click();
	await expect.element(page.getByRole('dialog')).toBeInTheDocument();
	return onClose;
}

const headerClose = () => page.getByRole('dialog').getByRole('button', { name: 'Close' });
const backdrop = () => page.getByRole('button', { name: 'Close' }).first();

describe('Modal.svelte', () => {
	it('shows its content and header extras', async () => {
		await openModal();

		await expect.element(page.getByText('Header extra')).toBeInTheDocument();
		await expect.element(page.getByLabelText('First field')).toBeInTheDocument();
	});

	describe('closing', () => {
		it('closes on Escape', async () => {
			const onClose = await openModal();

			await userEvent.keyboard('{Escape}');

			expect(onClose).toHaveBeenCalledOnce();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('closes from the close button', async () => {
			const onClose = await openModal();

			await headerClose().click();

			expect(onClose).toHaveBeenCalledOnce();
		});

		it('closes from the backdrop', async () => {
			const onClose = await openModal();

			await backdrop().click({ position: { x: 5, y: 5 } });

			expect(onClose).toHaveBeenCalledOnce();
		});

		it('ignores Escape while something is open on top of it', async () => {
			const onClose = await openModal({ obscured: true });

			await userEvent.keyboard('{Escape}');

			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('with unsaved changes', () => {
		it('asks before closing instead of closing', async () => {
			const onClose = await openModal({ dirty: true });

			await userEvent.keyboard('{Escape}');

			await expect
				.element(page.getByRole('alert').filter({ hasText: 'Discard your changes?' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
			expect(onClose).not.toHaveBeenCalled();
		});

		it('keeps editing when asked to', async () => {
			const onClose = await openModal({ dirty: true });

			await headerClose().click();
			await page.getByRole('button', { name: 'Keep editing' }).click();

			await expect.element(page.getByText('Discard your changes?')).not.toBeInTheDocument();
			await expect.element(page.getByRole('dialog')).toBeInTheDocument();
			expect(onClose).not.toHaveBeenCalled();
		});

		it('backs out of the question on a second Escape', async () => {
			const onClose = await openModal({ dirty: true });

			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByText('Discard your changes?')).toBeInTheDocument();
			await userEvent.keyboard('{Escape}');

			await expect.element(page.getByText('Discard your changes?')).not.toBeInTheDocument();
			expect(onClose).not.toHaveBeenCalled();
		});

		it('closes once the changes are discarded', async () => {
			const onClose = await openModal({ dirty: true });

			await headerClose().click();
			await page.getByRole('button', { name: 'Discard' }).click();

			expect(onClose).toHaveBeenCalledOnce();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('name', () => {
		it('is named by the heading inside it', async () => {
			await openModal({ heading: 'Edit keyboard' });

			await expect.element(page.getByRole('dialog', { name: 'Edit keyboard' })).toBeInTheDocument();
		});

		it('falls back to its label while it has no heading, and prefers the heading', async () => {
			const onClose = vi.fn();
			const { rerender } = await render(ModalHarness, { onClose, label: 'Build' });
			await page.getByRole('button', { name: 'Open' }).click();
			await expect.element(page.getByRole('dialog', { name: 'Build' })).toBeInTheDocument();

			await rerender({ onClose, label: 'Build', heading: 'Neo65 Cu' });

			await expect.element(page.getByRole('dialog', { name: 'Neo65 Cu' })).toBeInTheDocument();
		});

		it('picks up a heading that appears after it opens', async () => {
			const onClose = vi.fn();
			const { rerender } = await render(ModalHarness, { onClose });
			await page.getByRole('button', { name: 'Open' }).click();
			await expect.element(page.getByRole('dialog')).toBeInTheDocument();

			await rerender({ onClose, heading: 'Manta' });

			await expect.element(page.getByRole('dialog', { name: 'Manta' })).toBeInTheDocument();
		});
	});

	describe('focus', () => {
		it('moves focus into the dialog when it opens', async () => {
			await openModal();

			await expect.element(headerClose()).toHaveFocus();
		});

		it('prefers the element marked for autofocus', async () => {
			await openModal({ autofocusSecond: true });

			await expect.element(page.getByLabelText('Second field')).toHaveFocus();
		});

		it('returns focus to whatever opened it', async () => {
			await openModal();

			await userEvent.keyboard('{Escape}');

			await expect.element(page.getByRole('button', { name: 'Open' })).toHaveFocus();
		});

		it('keeps Tab inside the dialog, wrapping at both ends', async () => {
			await openModal();
			await expect.element(headerClose()).toHaveFocus();

			await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
			await expect.element(page.getByRole('button', { name: 'Last button' })).toHaveFocus();

			await userEvent.keyboard('{Tab}');
			await expect.element(headerClose()).toHaveFocus();
		});
	});
});

describe('Modal.svelte opening', () => {
	afterEach(async () => {
		await cdp().send('Animation.setPlaybackRate', { playbackRate: 1 });
		await cdp().send('Emulation.setEmulatedMedia', { features: [] });
	});

	const transition = (element: Element) =>
		element.getAnimations().find((animation) => Number(animation.effect!.getTiming().duration) > 0);
	const firstFrame = (element: Element) =>
		(transition(element)?.effect as KeyframeEffect | undefined)?.getKeyframes()[0];

	it('fades the backdrop in and scales the panel up, quickly', async () => {
		// Slowed down so the 120ms transition is still running when we look.
		await cdp().send('Animation.setPlaybackRate', { playbackRate: 0.01 });
		await openModal();

		const panel = page.getByRole('dialog').element();
		expect(firstFrame(panel)?.transform).toBe('scale(0.97)');
		expect(transition(panel)?.effect!.getTiming().duration).toBe(120);
		expect(Number(firstFrame(backdrop().element())?.opacity)).toBeCloseTo(0);
	});

	it('appears without motion when reduced motion is preferred', async () => {
		await cdp().send('Animation.setPlaybackRate', { playbackRate: 0.01 });
		await cdp().send('Emulation.setEmulatedMedia', {
			features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
		});
		await openModal();

		const running = (element: Element) =>
			element.getAnimations().filter((animation) => animation.playState === 'running');
		expect(running(page.getByRole('dialog').element())).toEqual([]);
		expect(running(backdrop().element())).toEqual([]);
	});
});

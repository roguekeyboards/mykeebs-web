import { afterEach, describe, expect, it } from 'vitest';
import { cdp } from 'vitest/browser';
import './layout.css';

function field(classes: string): HTMLInputElement {
	const container = document.createElement('div');
	container.style.width = '400px';
	const input = document.createElement('input');
	input.className = classes;
	container.append(input);
	document.body.append(container);
	return input;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('field-input', () => {
	it('fills its container by default', () => {
		expect(field('field-input').offsetWidth).toBe(400);
	});

	it('gives way to a width utility', () => {
		expect(field('field-input w-20').offsetWidth).toBe(80);
	});

	it('gives way to a font utility', () => {
		const plain = getComputedStyle(field('field-input')).fontFamily;
		const mono = getComputedStyle(field('field-input font-mono')).fontFamily;

		expect(mono).not.toBe(plain);
	});
});

describe('on a touch screen', () => {
	afterEach(async () => {
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	});

	it("keeps fields at 16px so iOS doesn't zoom in on focus", async () => {
		expect(getComputedStyle(field('field-input')).fontSize).toBe('14px');

		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

		expect(matchMedia('(any-pointer: coarse)').matches).toBe(true);
		expect(getComputedStyle(field('field-input')).fontSize).toBe('16px');
		const select = document.createElement('select');
		select.className = 'field-select';
		document.body.append(select);
		expect(getComputedStyle(select).fontSize).toBe('16px');
	});
});

describe('touch-action', () => {
	function buttonInScrollContainer(buttonClass = '') {
		const scroller = document.createElement('div');
		scroller.style.overflowY = 'auto';
		const button = document.createElement('button');
		button.className = buttonClass;
		scroller.append(button);
		document.body.append(scroller);
		return button;
	}

	it('stops double-tap zoom inside a scroll container and keeps pinch-zoom', () => {
		expect(getComputedStyle(buttonInScrollContainer()).touchAction).toBe('manipulation');
	});

	it('gives way to a touch utility', () => {
		expect(getComputedStyle(buttonInScrollContainer('touch-pan-y')).touchAction).toBe('pan-y');
	});
});

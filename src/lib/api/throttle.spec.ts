import { describe, expect, it, vi } from 'vitest';
import type { ResponseContext } from '@roguekeyboards/mykeebs-api-client';
import { isThrottled, retryWhenThrottled } from './throttle.js';

const throttled = () =>
	new Response('{"message":"Too Many Requests"}', {
		status: 429,
		headers: { 'Content-Type': 'application/json' }
	});
const uploadCap = () =>
	new Response('{}', { status: 429, headers: { 'Content-Type': 'application/problem+json' } });
const ok = () => new Response('{}', { status: 200 });

function run(first: Response, ...retries: Response[]) {
	const fetch = vi.fn<typeof globalThis.fetch>();
	for (const r of retries) fetch.mockResolvedValueOnce(r);
	const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
	const init: RequestInit = { method: 'POST', body: '{"name":"x"}' };
	const context: ResponseContext = { fetch, url: 'https://api.test/v1/x', init, response: first };
	return { fetch, sleep, init, result: retryWhenThrottled(sleep).post!(context) };
}

describe('isThrottled', () => {
	it("is API Gateway's plain 429, not mykeebs-api's Problem 429 or anything else", () => {
		expect(isThrottled(throttled())).toBe(true);
		expect(isThrottled(uploadCap())).toBe(false);
		expect(isThrottled(ok())).toBe(false);
	});
});

describe('retryWhenThrottled', () => {
	it('re-sends a throttled request, unchanged, until it gets through', async () => {
		const success = ok();
		const { fetch, sleep, init, result } = run(throttled(), throttled(), success);

		expect(await result).toBe(success);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenCalledWith('https://api.test/v1/x', init);
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
	});

	it('gives up after three retries and hands back the last 429', async () => {
		const last = throttled();
		const { fetch, sleep, result } = run(throttled(), throttled(), throttled(), last);

		expect(await result).toBe(last);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000, 2000]);
	});

	it("passes mykeebs-api's upload-cap 429 and ordinary responses straight through", async () => {
		for (const response of [uploadCap(), ok()]) {
			const { fetch, sleep, result } = run(response);

			expect(await result).toBe(response);
			expect(fetch).not.toHaveBeenCalled();
			expect(sleep).not.toHaveBeenCalled();
		}
	});
});

import type { Middleware } from '@roguekeyboards/kbdb-api-client';

const RETRY_DELAYS_MS = [500, 1000, 2000];

export function isProblemResponse(response: Response): boolean {
	return response.headers.get('Content-Type')?.includes('application/problem+json') ?? false;
}

// API Gateway's throttle answers 429 with plain JSON before the request
// reaches kbdb; kbdb's own 429s (the daily upload cap) are Problem responses.
export function isThrottled(response: Response): boolean {
	return response.status === 429 && !isProblemResponse(response);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function retryWhenThrottled(sleep: (ms: number) => Promise<void> = wait): Middleware {
	return {
		async post({ fetch, url, init, response }) {
			let current = response;
			for (const delay of RETRY_DELAYS_MS) {
				if (!isThrottled(current)) break;
				await sleep(delay);
				current = await fetch(url, init);
			}
			return current;
		}
	};
}

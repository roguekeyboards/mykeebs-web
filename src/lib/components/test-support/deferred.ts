export function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

export const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

export const openDialogs = () => document.querySelectorAll('[role="dialog"]').length;

export function motionDuration(ms: number): number {
	const reduced =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	return reduced ? 0 : ms;
}

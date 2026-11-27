// A stand-in for `$app/state`'s page whose url, like the real one, is reactive.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- replaced whole, never mutated, like the real page.url
export const page = $state({ url: new URL('http://localhost/'), state: {} });

export const appPage = $state({
	params: { username: 'jay' } as Record<string, string>,
	url: { pathname: '/u/jay' }
});

export function goTo(pathname: string, username = 'jay') {
	appPage.params = { username };
	appPage.url = { pathname };
}

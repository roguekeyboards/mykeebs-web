export function isAtOrUnder(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function isProfileTabActive(
	pathname: string,
	tabHref: string,
	overviewHref: string
): boolean {
	return tabHref === overviewHref ? pathname === tabHref : isAtOrUnder(pathname, tabHref);
}

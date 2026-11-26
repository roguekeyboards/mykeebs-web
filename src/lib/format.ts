export type PurchaseLike = {
	vendor?: string;
	price?: number;
	currency?: string;
	quantity?: number;
	orderDate?: Date;
	deliveryDate?: Date;
	estimatedDeliveryDate?: Date;
	orderStatus?: string;
};

const orderStatusColors: Record<string, string> = {
	planned: 'status-planned',
	ordered: 'status-ordered',
	shipped: 'status-shipped',
	delivered: 'status-delivered',
	cancelled: 'status-cancelled'
};

export function orderStatusClass(status: string): string {
	return orderStatusColors[status.toLowerCase()] ?? 'status-default';
}

// API calendar dates parse as UTC midnight, so formatting in local time
// would roll back a day west of UTC.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});

export function formatDate(date: Date | undefined): string | undefined {
	return date ? dateFormatter.format(date) : undefined;
}

const priceFormatters = new Map<string, Intl.NumberFormat>();

function priceFormatterFor(currency: string): Intl.NumberFormat {
	let formatter = priceFormatters.get(currency);
	if (!formatter) {
		formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
		priceFormatters.set(currency, formatter);
	}
	return formatter;
}

export function formatPrice(
	price: number | undefined,
	currency: string | undefined
): string | undefined {
	return price != null && currency ? priceFormatterFor(currency).format(price) : undefined;
}

// API calendar dates parse as UTC midnight, so they must be read back in UTC
// to round-trip the same day.
export function toDateInput(date: Date | undefined): string {
	return date ? date.toISOString().slice(0, 10) : '';
}

// Local, unlike toDateInput: a real timestamp formatted in UTC would land on
// the wrong day west of UTC.
export function todayDateInput(): string {
	const now = new Date();
	const year = String(now.getFullYear()).padStart(4, '0');
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

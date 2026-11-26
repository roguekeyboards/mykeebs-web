<script lang="ts">
	import { resolve } from '$app/paths';
	import { ecPartsApi, keyboardsApi, keycapSetsApi, switchesApi } from '#lib/api/client.js';
	import OrderStatusBadge from '#lib/components/OrderStatusBadge.svelte';
	import { formatEstimate } from '#lib/estimated-delivery.js';
	import { formatDate, formatPrice, todayDateInput } from '#lib/format.js';
	import {
		isLate,
		ORDER_KIND_LABELS,
		ordersAwaitingDelivery,
		sectionsByQuarter,
		type Order,
		type OrderSection
	} from '#lib/order-tracker.js';
	import { pageTitle } from '#lib/page-title.js';
	import { fetchAllPages } from '#lib/pagination.js';
	import { getUserContext } from '#lib/user-context.js';

	const userContext = getUserContext();
	const today = todayDateInput();

	let sections = $state<OrderSection[] | null>(null);
	let loadFailed = $state(false);
	let loadToken = 0;

	async function load(userId: string) {
		const token = ++loadToken;
		loadFailed = false;
		try {
			const [keyboards, keycapSets, switches, ecParts] = await Promise.all([
				fetchAllPages((request) => keyboardsApi.listKeyboards({ userId, ...request })),
				fetchAllPages((request) => keycapSetsApi.listKeycapSets({ userId, ...request })),
				fetchAllPages((request) => switchesApi.listSwitches({ userId, ...request })),
				fetchAllPages((request) => ecPartsApi.listECParts({ userId, ...request }))
			]);
			if (token !== loadToken) return;
			sections = sectionsByQuarter(
				ordersAwaitingDelivery({ keyboards, keycapSets, switches, ecParts }),
				today
			);
		} catch {
			if (token !== loadToken) return;
			loadFailed = true;
		}
	}

	$effect(() => {
		if (userContext.isOwnProfile && userContext.userId) load(userContext.userId);
	});

	const showPrice = $derived(userContext.showPrice);
	const orderCount = $derived(sections?.reduce((n, s) => n + s.orders.length, 0) ?? 0);
	const currency = $derived(sections?.map((s) => s.currency).find(Boolean));
	const outstanding = $derived(
		formatPrice(
			sections?.reduce((sum, s) => sum + (s.total ?? 0), 0),
			currency
		)
	);

	const LIST_ROUTES = {
		keyboard: '/u/[username]/keyboards',
		plate: '/u/[username]/keyboards',
		pcb: '/u/[username]/keyboards',
		keycaps: '/u/[username]/keycap-sets',
		switches: '/u/[username]/switches',
		'ec-parts': '/u/[username]/ec-parts'
	} as const;

	function orderHref(order: Order): string {
		const list = resolve(LIST_ROUTES[order.kind], { username: userContext.username });
		return `${list}?open=${encodeURIComponent(order.itemId)}`;
	}

	function sectionSummary(section: OrderSection): string {
		const count = `${section.orders.length} ${section.orders.length === 1 ? 'order' : 'orders'}`;
		const total = showPrice ? formatPrice(section.total, section.currency) : undefined;
		return total ? `${count} · ${total}` : count;
	}

	const sectionNotes: Record<string, string> = {
		overdue: 'expected in a quarter that has ended',
		unestimated: 'ordered, with no expected date yet'
	};
</script>

<svelte:head><title>{pageTitle('Orders', `@${userContext.username}`)}</title></svelte:head>

{#if !userContext.isOwnProfile}
	<p class="text-muted p-16 text-center">Only the owner can see their orders.</p>
{:else if loadFailed}
	<p class="p-16 text-center text-lg" role="alert" style="color: var(--danger)">
		Could not load your orders.
	</p>
{:else if !sections}
	<p class="text-muted p-16 text-center font-mono text-sm tracking-wide" role="status">
		Loading&hellip;
	</p>
{:else}
	<div class="flex flex-col gap-8">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-1">
				<h2 class="heading-lg text-2xl">On order</h2>
				<p class="text-muted text-sm">
					Everything ordered and not yet delivered, by the quarter it's expected.
				</p>
			</div>
			<dl class="flex flex-wrap gap-3">
				<div class="kc-card px-4 py-3">
					<dt class="section-label mb-1">Orders</dt>
					<dd class="heading-lg text-xl" style="font-family: var(--font-display)">{orderCount}</dd>
				</div>
				{#if showPrice && outstanding}
					<div class="kc-card px-4 py-3">
						<dt class="section-label mb-1">Outstanding</dt>
						<dd class="heading-lg text-xl" style="font-family: var(--font-display)">
							{outstanding}
						</dd>
					</div>
				{/if}
			</dl>
		</div>

		{#if sections.length === 0}
			<p class="text-muted p-8 text-center">Nothing on order.</p>
		{/if}

		{#each sections as section (section.key)}
			<section class="flex flex-col gap-2" aria-labelledby="orders-{section.key}">
				<div
					class="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2"
					style="border-color: var(--border)"
				>
					<div class="flex items-baseline gap-3">
						<h3
							id="orders-{section.key}"
							class="heading-lg text-xl"
							style:color={section.tone === 'overdue'
								? 'var(--danger)'
								: section.tone === 'unestimated'
									? 'var(--text-muted)'
									: undefined}
						>
							{section.title}
						</h3>
						{#if section.current || sectionNotes[section.tone]}
							<span class="text-faint text-sm">
								{section.current ? 'this quarter' : sectionNotes[section.tone]}
							</span>
						{/if}
					</div>
					<span class="text-muted font-mono text-sm">{sectionSummary(section)}</span>
				</div>
				<ul class="overflow-x-auto">
					{#each section.orders as order (order.key)}
						{@const late = isLate(order, today)}
						<li>
							<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus a query -->
							<a
								href={orderHref(order)}
								class="order-row grid min-w-[52rem] items-center gap-4 rounded-lg px-3 py-3"
							>
								<span class="text-faint text-xs tracking-wider uppercase">
									{ORDER_KIND_LABELS[order.kind]}
								</span>
								<span class="flex min-w-0 flex-col">
									<span class="truncate font-semibold">{order.name}</span>
									{#if order.detail}
										<span class="text-muted text-sm">{order.detail}</span>
									{/if}
								</span>
								<span class="text-muted truncate text-sm">{order.purchase.vendor ?? ''}</span>
								<span class="flex flex-wrap gap-1">
									{#each order.statuses as status (status)}
										<OrderStatusBadge {status} showLabel />
									{/each}
								</span>
								<span class="text-muted text-sm">{formatDate(order.purchase.orderDate) ?? ''}</span>
								<span
									class="font-mono text-sm"
									style:color={late ? 'var(--danger)' : undefined}
									title={late ? 'Past its estimate' : undefined}
								>
									{formatEstimate(order.purchase.estimatedDeliveryDate) ?? '—'}
								</span>
								<span class="text-right font-mono text-sm">
									{showPrice
										? (formatPrice(order.purchase.price, order.purchase.currency) ?? '')
										: ''}
								</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}

<style>
	.order-row {
		grid-template-columns: 6rem minmax(0, 1fr) 9rem 7.5rem 7.5rem 8rem 6.5rem;
		color: var(--text);
		border-bottom: 1px solid var(--surface);
	}
	.order-row:hover {
		background: var(--surface-hover);
	}
</style>

# tests

Dependency-free regression harnesses for the part of the site no syntax check can
see: the operations portals, which paint their tables from a live Realtime
Database subscription rather than from data present at load.

```bash
node tests/run-all.cjs                            # everything (150 checks), exits 1 on any failure
node tests/order-service-harness.cjs              # the feed contract itself (12 checks)
node tests/admin-stats-harness.cjs                # the dashboard numbers (21 checks)
node tests/order-feed-harness.cjs                 # all three portals (117 checks)
node tests/order-feed-harness.cjs super-admin     # or: staff, delivery
```

Plain Node (16+), the `vm` module and the repository's own files. No
dependencies, no build step, no network.

## What is covered

| Harness | Pins |
| --- | --- |
| `order-service-harness.cjs` | A value listener per feed, a rejection handler registered alongside it and handed to the caller, a warning when there is no handler at all, `UNAVAILABLE` when the SDK never loaded, and a newest-first array out of a snapshot. |
| `admin-stats-harness.cjs` | `computeStats`: cancelled money stays out of every total, the Today / 7 day / 30 day windows are calendar windows (6 days back counts, 7 does not; 29 counts, 30 does not), orders with no timestamp stay out of the windows, the unverified-payment count that drives the Orders badge, the status funnel, best sellers ranked by quantity with money as the tiebreak, the payment breakdown (COD vs prepaid, verified vs unverified), and the shared CSV helpers (header order, quoting, range-named filename). |
| `order-feed-harness.cjs` | Each portal boots and paints; empty vs refused vs silent feeds; the failure row and its Retry; the ledger's coupon line, unverified badge, delete confirmation and CSV export (header, in-view rows, plain amounts, filenames following the range); ledger filters that persist in the URL (search debounce, status, date range, boot from a bookmarked URL); the unverified-payments badge reconciling down to exactly the rows it counts, with the banner, bulk **Mark Paid** and per-row Mark Paid confirmed through the service; the order detail drawer (markup, print, close); the dashboard insight panels (best sellers, funnel, payment breakdown); the placed-date filter and the "This month" preset; packing slips with gift notes; the bulk selection with Mark Packed / Print slips; and staff parity — date range + presets, CSV export sharing the ledger's header, and select column + bulk bar. |

## Why these exist

Two production bugs of the same shape, neither visible in a browser until a
specific role or a specific database state was reached:

1. **`escAttr()` called `escText()`**, which does not exist (the helper is
   `escapeText`). It is used only by the ledger row's Delete button, which only
   renders for Super Admin+ / Super Admin++. So *every* row threw a
   `ReferenceError` inside the template's `.map()`, the `innerHTML` assignment
   never happened, and the table stayed on "Loading orders ledger..." for ever.
   A plain Super Admin saw a perfectly healthy page.
2. **The subscriptions never passed Firebase's rejection callback**, so a refused
   read (rules not yet published) produced no callback at all — the table then sat
   on its spinner, or on "No orders match the selected filters.", which sends
   whoever is looking hunting for a filter bug that does not exist.

Both are covered: the feed harness fails if a row template throws for an elevated
role, and both harnesses fail if a rejection stops reaching the caller.

## How they work

`lib/portal-dom.cjs` is a small DOM (elements, classList, attributes, innerHTML
parsed flat) plus a fake `window` with recorded timers, dialogs, blobs, storage,
history and service stubs. Each portal boot seeds the real page's markup into
the stub body, so ids, classes and tab switches resolve the way a browser would
resolve them. A harness boots the **real controller file** against it, fires
`DOMContentLoaded`, then drives the feed by hand:

```js
const portal = await bootPortal({ controller: 'js/admin-super-controller.js', ... });
await portal.settle();
portal.feed.snapshot(orders);                    // a live value
portal.feed.fail({ code: 'PERMISSION_DENIED' }); // a refused read
portal.fireTimers(12000);                        // the watchdog, without waiting 12s
```

Timers are recorded rather than waited on, so the watchdog is decided in a
millisecond, and everything asserted on is what the operator would have seen on
screen.

## Adding a check

Prefer a check over a comment. When a table can hang, hide a failure, or mislead
with an empty state, add it here: boot a portal with the options the config
object already supports (`role`, `omitOrders`), drive it, and assert on the
rendered HTML.

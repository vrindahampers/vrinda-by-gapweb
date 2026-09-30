# tests

Dependency-free regression harnesses for the part of the site no syntax check can
see: the operations portals, which paint their tables from a live Realtime
Database subscription rather than from data present at load.

```bash
node tests/run-all.cjs                            # everything (72 checks), exits 1 on any failure
node tests/order-service-harness.cjs              # the feed contract itself (12 checks)
node tests/order-feed-harness.cjs                 # all three portals (60 checks)
node tests/order-feed-harness.cjs super-admin     # or: staff, delivery
```

Plain Node (16+), the `vm` module and the repository's own files. No
dependencies, no build step, no network.

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
parsed flat) plus a fake `window` with recorded timers, dialogs, blobs, storage
and service stubs. A harness boots the **real controller file** against it, fires
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

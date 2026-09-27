# Newsletter ("Join The Inner Circle")

The homepage signup now saves real, exportable data instead of showing a
thank-you and discarding the address.

## What is stored, and where

Every signup is written to `/newsletter/{key}` in Firebase Realtime Database:

| Field | Meaning |
| --- | --- |
| `email` | Lower-cased address. The only required field besides `createdAt`. |
| `userId` | The account uid when the visitor was signed in, otherwise `""`. |
| `userName` | Display name at signup time, when signed in. |
| `signedIn` | Whether an account was attached to the signup. |
| `source` | Where the form was submitted from (`homepage` today). |
| `status` | `subscribed` or `unsubscribed`. Unsubscribing keeps the row. |
| `createdAt` / `updatedAt` | Server timestamps. |

**`createdAt` is never overwritten.** A re-subscribe updates the address but
keeps the original join date, so the list does not inflate on repeat signups.

## The key — why nobody is asked twice

The row is keyed by the **account uid** when signed in, so one person is one
row no matter which email they type. A signed-out visitor is keyed by a hash of
their address (`anon-<hash>`), which recognises a repeat signup on the same
browser without putting the address in a localStorage key.

When the form is submitted again, or when the homepage loads, the service checks
for an existing subscription and swaps the form for a confirmation instead of
asking a returning subscriber a second time. The check is authoritative on the
server for signed-in users; a local cache avoids the round-trip for guests.

## Security

- The node is **not publicly readable** — it holds email addresses, so only ops
  roles (including the new `manager` and `owner`) can read the whole list.
- A visitor can only write **their own row** (`auth.uid === $uid`).
- `.validate` requires `email` to be a string of at most 254 characters and
  requires `createdAt` to be present, which blocks junk columns and absurd rows.

## Running a campaign

**Admin → Newsletter** lists every subscriber with counts, and **⬇ Export CSV**
downloads the list. The CSV has a plain `email` column, so it can be pasted
straight into a Gmail / Google Sheets / Mailchimp campaign.

Unsubscribed subscribers are **excluded** by default — a campaign must never mail
somebody who opted out.

Point the unsubscribe link in each campaign at:

```
https://vrindahampers.qzz.io/pages/unsubscribe.html?email=<address>
```

`pages/unsubscribe.html` sets the status to `unsubscribed` and keeps the row so
the address is not mailed again.

### Why there is no "send" button yet

Gmail SMTP cannot be used from a browser: the connection is made outside the
fetch/XHR model and Gmail blocks it from a page origin. The usual fix is a server
(Cloud Functions or the Cloudflare Worker), and this Firebase project is on the
**Spark** plan, which has no Cloud Functions.

Exporting a CSV sidesteps that entirely and works with any mail tool. When you
want sending built in, the free options are a Cloudflare Worker (already set up
for the FamGateway webhook) calling a transactional email API, or moving the
project to the Blaze plan for Cloud Functions + SMTP. The data model above is
already the shape either approach needs.

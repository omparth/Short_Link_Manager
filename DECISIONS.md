# Decisions

## 1. Custom slug conflicts

Custom slugs must be unique.

If a requested slug already exists, the API returns `409 Conflict` instead of changing the slug automatically. MongoDB has a unique index on the slug field, so the database remains the final source of truth if two requests try to create the same slug at the same time.

## 2. Click cap and concurrent clicks

The click cap is checked as part of the database update that increments the click count.

A redirect is only allowed when the link is active and the current click count is still below the cap. The increment is atomic, so if two or more requests arrive for the last available click, only one request can increment the count and receive the redirect. The others receive `410 Gone`.

The click is counted before the redirect is sent. This makes the cap enforcement deterministic even under concurrent requests.

## 3. Stats after a link is capped or disabled

Click history remains available after a link reaches its cap or is manually disabled.

The link stops accepting new clicks, but existing click data is not removed. This means the detail page can still show the link's performance after it becomes inactive.

## 4. Timezone for daily stats

Daily click statistics use UTC.

The stats API returns the last seven UTC calendar days and fills days with no clicks with `0`. Using UTC keeps the calculation consistent regardless of the machine's local timezone.

## Other implementation decisions

### Search and pagination

Search and pagination are handled on the server. The API filters by slug or destination URL and only returns the requested page, rather than loading all links into the client.

### Deleting a link

Deleting a link also deletes its associated click history. This prevents click records from being left behind for a link that no longer exists.

## Tradeoff I'd revisit

The current implementation keeps a `clickCount` on the link as well as individual click records. This makes the list view fast and keeps the click cap check simple, but it means the counter and click history are two pieces of related data.

With more time, I would consider using a database transaction or a stronger consistency strategy so the counter update and click record creation are guaranteed to succeed or fail together.

## Anything unfinished

The core requirements are implemented by Me.The optional AI feature was intentionally skipped because it was not required and the assessment states that skipping it has no penalty.


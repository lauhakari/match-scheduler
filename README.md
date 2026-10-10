# Spelschema

A Swedish tournament-day scheduler originally built for youth hockey. Create clubs/teams, schedule games across rinks with rest and pause constraints, and export tournament or club PDFs. Generation runs in the browser; Cloudflare Pages Functions and D1 store shared schedules.

The randomized greedy scheduler respects rest, rink conflicts, maximum games and club pauses, but does not guarantee every requested minimum or preference. Each pair of teams plays at most once. Review the warnings and fixtures before using them for a tournament.

## Development

Use Node.js 24 LTS or newer and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

`npm run dev` runs the interface only. For saving and sharing, initialize local D1 and serve the built app with Pages:

```sh
npm run build
npm run db:local
npm run dev:pages
```

Open http://127.0.0.1:8788. This uses local SQLite files under `.wrangler/`, not a cloud database. Rebuild after frontend changes when using the Pages server.

## Saved schedules

Generate, then choose **Spara & dela**. Copy the public viewing link for participants and keep the separate private editing link. Regenerating and saving through the edit link updates the same public URL. Changing form fields alone does not change generated or published fixtures.

Anyone with the public link can view. Anyone with the edit link can update or delete. There are no accounts or edit-link recovery; treat the edit link like a password. The browser that saves or opens an edit link remembers it, so the address bar only ever shows the public link. Saved schedules are deleted 180 days after their last save. Deletion removes the online copy and keeps a local draft. Concurrent edits with stale versions are rejected; refresh before retrying.

Club/settings drafts and the latest generated result stay in local storage. Existing compressed `#s=` links remain readable when valid; new sharing uses the database.

Limits: 20 clubs, 80 teams, 10 rinks, a bounded scheduling workload, 512 KiB per save request and 30 mutations per IP per hour. Meal slots keep clubs together; capacity smaller than one club is rejected.

## Cloudflare deployment

The database ID in `wrangler.jsonc` is a **local placeholder**. Deployment and remote database changes require separate authorization.

1. Create a D1 database named `game-scheduler` and put its database ID in `wrangler.jsonc`.
2. Apply `migrations/0001_schedules.sql` to production using Wrangler D1 migrations with `--remote`.
3. Create a Pages project from this repository. Build command: `npm run build`. Output: `dist`.
4. Ensure the Function has a D1 binding named `DB`. Use a separate database for previews and apply the migrations there too.
5. Deploy `functions/` along with the static build. Verify public reads, private edits, PDF exports and the unchanged public link after updates.

Only `/api/*` invokes Functions; `/s/:id` uses Pages' static SPA fallback and fetches its data from the API. Database credentials never reach the browser. Edit tokens are returned only at creation, sent in authorization headers, and stored as SHA-256 hashes in D1. Rate limits are enforced atomically in D1 without storing raw IP addresses.

Tests cover scheduling regressions and 200 deterministic tournaments, Vue workflows, PDF content, malformed links, actual SQLite queries, authorization, version conflicts, request limits and rate limits. They do not replace checking the deployed hostname or physical mobile devices.

## Privacy and scope

Saving sends clubs, settings and fixtures to the database. Public links are unlisted, not confidential. Use team names rather than individual children's details. Google Fonts loads externally. There is no account service or analytics code.

Scores, standings, playoffs, age divisions, referee allocation and collaborative live editing are outside the current scope. A source redistribution license has not yet been selected.

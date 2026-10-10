# Public-release fixes

Implemented on `fix/public-release`, 10 October 2026.

## Changes

- Relaxed opposing-club diversity in every round so feasible games are not blocked until the last round.
- Added bounded, shared validation before scheduling, restoring drafts and accepting API/link payloads. Zero/negative/fractional durations and invalid times are rejected; oversized workloads cannot enter generation.
- Added stable club/team IDs, unique name validation, unused default names and independent generation snapshots. Editing a draft no longer changes its generated schedule or PDF metadata.
- Kept opt-out/shorter club pauses from unnecessarily blocking all rinks, and preserved rink changeover time around universal pauses.
- Rejected meal capacity smaller than a club and meal slots extending beyond the tournament day.
- Reworked pause/meal controls for small screens, added keyboard club ordering, visible focus, error announcements and wrapping schedule actions.
- Added a Pages Function with D1 migrations for create/read/update/delete. Public links stay unchanged after updates. Private edit tokens are hashed in D1, and stale versions cannot overwrite newer saves. Writes are bounded and limited to 30 per IP per hour.
- Added separate public/edit links, editor prefills, save failures that preserve local work and confirmed deletion. Older compressed links remain readable when valid; malformed links display errors.
- Protected asynchronous save/navigation state from stale responses and generation during a pending save.
- Preserved warning lists in saved views and restored the latest generated result from local storage.
- Updated dependencies and loaded PDF code only on export. The initial main JavaScript bundle is now about 136 kB before gzip, versus 544 kB at review time.

## Verification

`npm test`: **36 passed, 0 failed**, including 200 deterministic tournament scenarios, component flows, actual PDF bytes/content and actual SQLite queries. Source checks against the original scheduler produced five failing regressions before the fixes.

`npm run build`: passed without the previous oversized-main-chunk warning.

`npm audit --json`: **0 known vulnerabilities**. Current output is in `current-dependency-audit.json`; final test output is in `current-test-results.txt`. The older test/audit files document the original review baseline.

Local Wrangler/D1 migration and Worker compilation passed. In Chrome, verified default teams each receive two games, created a saved schedule, renamed a team, updated it, opened the same public link in another tab, reloaded the private editor and downloaded the updated PDF. Public views showed the changed team name; private editor inputs matched the saved data.

The final 390 × 844 mobile visual recheck was interrupted when Chrome became unavailable. Responsive markup and component tests are in place, but a final visual pass on mobile remains necessary. Physical phones, Safari/Firefox, large-tournament performance and PDF pagination for unusually long labels were not covered.

## Deployment handoff

All testing used local D1. No Cloudflare cloud database was created, no remote migration was applied and nothing was deployed. Replace the local database ID in `wrangler.jsonc` and follow README deployment instructions, using a separate preview database.

Scheduling remains a best-effort heuristic; min-game, clustering and first/last preferences are not guarantees. The private edit link has no recovery mechanism. Public links are unlisted rather than confidential. Source redistribution licensing remains a separate decision.

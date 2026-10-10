# Game scheduler review

Implementation update: this report describes the original baseline. Fixes and Cloudflare Pages/D1 sharing are implemented on `fix/public-release`; see README and run `npm test` for current checks. The saved test/audit output below remains historical evidence.

Reviewed 10 October 2026. Scope: source review, production build, executable logic checks, local Chrome workflows and a 390 × 844 emulated mobile viewport. Application source and dependencies were left unchanged. The files in `review/` are the review deliverables.

## Verdict

The app has a useful feature set and a simple architecture that suits a free tournament tool. I would fix the scheduling, input validation, identity and snapshot problems before inviting people to rely on it for a real tournament. The default example currently fails to give every team its requested two games even though a valid schedule easily fits. Mobile advanced controls also need attention.

This is a one-day schedule generator, rather than a complete tournament-management system. It has no scores, standings, brackets, age/skill divisions, referee assignments, accounts or live collaboration. Its rink terminology and time model are hockey-oriented, although its core pairing logic could serve other sports.

## Features present

| Area | Features |
| --- | --- |
| Participants | Add/remove clubs and teams, edit names, drag clubs into a different order, give travelling clubs a clustering preference. |
| Tournament settings | Start/end time, game duration, rink changeover time, multiple rinks, minimum/maximum games, minimum rest, optional games between teams from the same club. |
| Pauses | Fixed pauses, staggered windows, club-specific durations including opting out, recurrence by minutes or rounds. |
| Food breaks | Group whole clubs into meal slots, starting at a chosen time, with a duration and team-capacity setting. |
| Generation | Randomized greedy assignment, preference for teams with fewer games and different opposing clubs, best-effort first/last-round avoidance. |
| Presentation | Color-coded time/rink grid, pause rows, per-team counts, below-minimum status and warning list. |
| Export | Landscape tournament PDF, optional team summary, portrait PDFs per club, and an all-clubs action. |
| Sharing | Entire schedule compressed into a URL fragment; recipients get a read-only view with PDF exports and a create-new action. |
| Persistence | Clubs/settings automatically saved in browser local storage. The generated schedule itself is not restored from local storage. |
| Deployment | Vue/Vite static application; no application server or database required. |

Minimum games, clustering, opponent diversity and first/last preferences are not guarantees. Identical team pairings are never repeated, so the maximum possible games depends on the number of eligible opponents. The UI should explain these limitations more clearly.

## What was actually tested

`npm run build` passed. Vite warned that the main JavaScript chunk is 543.63 kB before gzip (179.38 kB gzipped). This is an optimization opportunity, not a build failure.

The repository originally had no test runner, automated tests or lint command. I added a standalone review harness, `review/verify.mjs`, without changing app code. Run it from the project root:

```sh
node review/verify.mjs
```

The final result is **13 passed, 7 failed**, with exit status 1. Full output is in `review/test-results.txt`. Failures deliberately assert the desired behavior and document existing defects.

| Check | Result |
| --- | --- |
| 200 seeded tournaments: time bounds, rest, rink/team conflicts, unique pairings, max games, internal-match rule and accurate counts | Passed for all 200 generated cases. |
| Fewer than two teams; one club with internal games disabled; too-short day | Correctly rejected. |
| One club with internal games enabled | Generated a schedule. |
| Default feasible four-team tournament reaches two games per team | Failed. |
| Fixed pause blocks games | Passed. |
| Time recurrence expands correctly; round recurrence inserts a break | Passed. |
| Staggered club pauses and meal slots block participating clubs | Passed for the exercised cases. |
| Meal capacity when a single club has more teams than capacity | Failed. |
| Duplicate team names remain distinct or are rejected | Failed. |
| Team and pause settings remain unchanged in generation snapshot after form edits | Failed in two separate checks. |
| Valid shared data round-trip; corrupt compression rejected | Passed. |
| Structurally malformed shared data rejected | Failed. |
| Tournament PDF with/without summary and both club PDFs | Real PDF bytes generated successfully. |
| Zero game duration plus zero changeover terminates | Failed; child process exceeded one-second timeout. |

The PDF check runs the original export functions against real jsPDF/autoTable with a Node-only import adapter and redirects saves to temporary files. This verifies generation, not visual pagination or correct rendering for every language/name length.

In Chrome, I loaded the local app, generated the default schedule, verified its game counts/warnings, exported and saved an actual 31,757-byte PDF, created a share link and refreshed into the read-only view. The recipient view retained the schedule and per-team below-minimum statuses, but omitted the warning list. I also opened advanced settings and added a pause and meal break at mobile width; their controls visibly overflowed horizontally. The initial mobile club cards and single-column settings rendered.

Coverage limits: Chrome desktop and Chrome mobile emulation only; no physical phone, Safari/Firefox, screen-reader session, deployed HTTPS host, very large tournament benchmark or visual PDF pagination audit. Club drag ordering, clustering quality and the browser's multiple-download behavior were inspected in code but not fully exercised end to end. Rest/conflict success does not prove the greedy algorithm finds an optimal or feasible solution whenever one exists.

## Findings to fix before launch

### 1. High: feasible games are suppressed by the opponent-diversity rule

Source: `src/composables/useScheduler.js:374–395`.

With the untouched defaults, two clubs with two teams each have four valid cross-club pairings. The app schedules two games at 09:00/09:20, leaves the rink empty for most of the day, then schedules only one more at 16:40. Two teams get one game instead of the requested two. This reproduced in both the harness and Chrome.

For every round except the last, `maxPasses` is 2 and `requireNewClub = pass < 2` is true in both passes. After teams have faced the only other club, remaining distinct team pairings are rejected. The promised relaxation to any eligible opponent occurs only in the final round. That final round has only one rink, so one valid pairing remains unscheduled.

A feasible four-game example using the same rest/changeover limits is A1–B1 at 09:00, A2–B2 at 09:20, A1–B2 at 10:00 and A2–B1 at 10:40. Treat opposing-club diversity as a preference with a fallback in every round. Keep this example as regression coverage.

### 2. High: unchecked numeric input can hang the browser

Sources: `src/components/SetupForm.vue:147`, `:165`; `src/composables/useScheduler.js:120`, `:210–250`.

The form uses `novalidate` and emits values without validation. HTML `min`/`max` attributes therefore do not prevent submission of manually entered out-of-range numbers. The scheduler also does not validate its inputs.

For `matchLength = 0` and `breakLength = 0`, `slotLength` is zero, the slot-generation loop never advances and generation runs indefinitely. A timeout-isolated subprocess reproduced this; I did not intentionally freeze the browser. Negative durations, fractional rink counts, blank fields and contradictory minimum/maximum counts are other unchecked inputs.

Validate finite integer ranges, valid times, end after start, a positive game/slot duration and minimum no greater than maximum before generation. Show field errors instead of proceeding. Consider a workload bound so very large user-created inputs cannot monopolize the UI thread.

### 3. High: form edits mutate an already generated schedule's metadata

Sources: `src/components/SetupForm.vue:147`; `src/composables/usePdfExport.js:490–498`.

Generation shallow-copies settings and club objects. Team objects and pause/meal arrays remain shared with the live form. Generate a schedule, then rename a team without generating again: its scheduled match retains the original identity, while club PDF metadata now uses the new name. The club export searches for the new identity and can state that no games are scheduled for a team that has a game.

The source-level form harness confirms the aliasing. A separate exporter reproduction using the real scheduler and a mocked PDF sink confirmed the resulting missing game table. Adding a pause after generation also changes emitted settings without recalculating blocked games.

Use a complete independent generation snapshot, or clearly invalidate the displayed schedule after edits. Make exported/shared metadata refer to the same snapshot as the match list.

### 4. High: names are unsafe identifiers

Sources: `src/composables/useScheduler.js:103–110`, `:281–285`; `src/components/SetupForm.vue:80–87`.

Teams are keyed by `ClubName::TeamName`. Two equally named teams inside one club collapse into a single statistics/rest identity. The harness produced four rows with only three distinct IDs and identical counts for the colliding teams. Duplicate club names also combine break/color/grouping state.

This can arise through normal editing: with teams named Lag 1, Lag 2, Lag 3, remove Lag 2 and add a team. Naming by array length produces another Lag 3. Names containing the identity delimiter can create additional collisions.

Give clubs and teams stable IDs independent of display names. At minimum, reject duplicate/empty names and choose unused default names until IDs are introduced.

### 5. Medium: malformed shared data can break rendering

Sources: `src/composables/useShareUrl.js:19`; `src/components/ScheduleGrid.vue:35`.

The loader accepts any truthy `c`, `s`, and `g`. A valid compressed payload containing `{c: [], s: {}, g: {}}` is accepted by the original function. Rendering then accesses missing `g.slots.length`. This is a verified loader acceptance defect and a direct render-path failure by source inspection; the malformed page itself was not opened in Chrome.

Validate arrays, settings and every schedule object before rendering. Add size limits to compressed/decompressed data and give recipients a useful invalid-link error. Link contents are untrusted input even though there is no backend.

### 6. Medium: mobile advanced controls extend off screen

Sources: `src/components/SetupForm.vue:478`, `:602`; `src/App.vue` schedule action row.

At a verified 390 × 844 Chrome emulated viewport, adding a pause and meal break puts the right-side duration/capacity/remove controls beyond the viewport. The rows use fixed-width inputs in a single unwrapped flex line. Schedule action buttons also need a narrow-screen layout, particularly the larger editable-view action group.

Use stacked/grid layouts at small widths and wrapping action groups. Keep horizontal scrolling local to the multi-rink schedule table. Include keyboard controls for club ordering rather than relying on dragging.

### 7. Medium: meal-slot capacity can be silently exceeded

Source: `src/composables/useScheduler.js:41–71`.

When a club alone has seven teams and the capacity is six, `groupFoodBreak` opens a slot containing all seven. Whole clubs are never split and no capacity warning is produced. The harness confirms this.

Preserving a club as a group is reasonable, but the tool must flag that the configured capacity cannot be respected or ask the organizer to increase it. If capacity is intended to be strict, split at the team level.

### 8. Update audited dependencies before publication

`npm audit --json` exited 1 and reported **11 affected packages: 1 critical, 7 high, 2 moderate and 1 low**. These are package findings, not 11 proven vulnerabilities in this app. npm reports a fix available for every listed package. Full advisory details are saved in `review/dependency-audit.json`.

The critical package is jsPDF. Its current advisories involve user-controlled PDF new-window output options and FreeText annotations. This app exports tables using `doc.save` and does not call those affected APIs, so I did not establish an exploit through this app's current workflow. See [jsPDF new-window advisory](https://github.com/advisories/GHSA-wfv2-pwc8-crg5) and [FreeText advisory](https://github.com/advisories/GHSA-7x6v-j9x4-qf24).

Vite advisories concern development-server access; serving the built static assets is a different exposure. See [Vite WebSocket file-read advisory](https://github.com/advisories/GHSA-p9ff-h696-f583). The Vue finding propagates from the server renderer, which this client-only app does not use. DOMPurify/fflate and several build-tool dependencies are also flagged; their affected paths were not exhaustively tested for reachability.

Update dependencies deliberately, commit the resulting lockfile when fixes are authorized, and rerun build and behavioral checks. Publish the static build, not a publicly reachable development server.

## Smaller issues and product limitations

- Sharing modifies the current URL to contain schedule A. Generating schedule B does not update or clear that fragment. Refresh can reopen A as a read-only page. Handle stale hashes and explain that sharing creates a snapshot.
- Shared pages omit the warning list because warnings are neither serialized nor reconstructed. Team-level below-minimum labels survive. Recipients should see the same scheduling limitations as the creator.
- With fewer than two teams, no valid pairings or no available slots, the scheduler returns warnings and sets the schedule to null. `ScheduleStats` only renders inside the `v-if="schedule"` block, so these generation errors have no visible output. Render generation errors independently of successful results.
- The generated schedule is not saved locally; reload without a share fragment restores inputs but loses the result. This should be explicit to users.
- Pause timing/display calculation is duplicated in the scheduler, grid and PDF exporter. Extract a shared normalized pause representation to reduce drift when changing this logic.
- Clustering is a weak heuristic: it favors matches involving a started cluster, rather than minimizing the time span of each travelling team's games. Avoid promising a compact visit until tested against realistic tournaments.
- Useful accessibility foundations exist: Swedish language metadata, input labels, fieldsets, named remove buttons and advanced-panel expansion state. Custom switches lack visible keyboard focus; the club PDF menu lacks expansion state/Escape handling; feedback is not announced through live regions. Muted small text needs a contrast audit.
- No tournament name/date, rink names, divisions or explanation of unique-pairing limits is present. A short usage guide and a clear beta status would help new organizers understand the outputs.
- No README or license file was present. If publishing the source for reuse, choose a license and document setup, scope, constraints and the hockey-tournament origin. Free hosted access and permission to reuse the source are separate decisions.

## Code review summary

The code is easy to navigate: the form, grid and statistics are separate components, with composables for scheduling, sharing and PDFs. Vue/Vite and a fully client-side design keep hosting and maintenance modest. Vue text interpolation is used for names rather than rendering user-provided HTML, and there is no server-side account/database surface to secure.

The most important weaknesses are data integrity and contract boundaries. Names carry identity, nested form state leaks into generated output, and inputs/shared payloads enter logic without a validated shape. The long scheduling method interleaves pause planning, slot creation and pairing priorities, making unintended interactions hard to spot. A few focused modules and durable regression tests would help more than a broad rewrite.

The review harness is useful reproducible evidence, but it is not a permanent component/browser test suite: it extracts Vue script bodies for snapshot checks and adapts PDF imports for Node. Once fixes are requested, replace those checks with ordinary unit/component tests and keep a small browser test covering generate, edit, export and share.

For performance, load the PDF dependencies only when exporting. The current main bundle pays their cost when someone only wants to view a shared schedule. More importantly, bound input sizes or move large scheduling work off the UI thread if larger tournaments become a supported use case.

## Privacy and publication notes

Scheduling and settings storage are local. There are no analytics/account services in the reviewed app code. Google Fonts is external, and Chrome's network panel confirmed font requests; therefore the page itself is not entirely offline/private despite the local scheduling design.

A share link contains the complete compressed clubs, settings and schedule. Compression is not encryption. Anyone with the link can read/copy the snapshot, and it cannot be revoked through the application. The URL fragment is not part of the normal HTTP request to the host, but links can still be retained in browser history or copied elsewhere. Team/club labels are sufficient here; individual children's names are unnecessary.

Recommended launch order: fix the hard opponent-diversity constraint and non-advancing inputs, protect generation snapshots and identities, validate shared payloads, repair mobile controls, update dependencies, then rerun these checks. A public beta is a reasonable next milestone after those changes, with clear best-effort scheduling language and instructions to review exported fixtures before using them.

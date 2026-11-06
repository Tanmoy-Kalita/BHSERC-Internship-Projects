# StackLab v1.0.0 — Test Report

<summary>
**Result: 47 / 47 checks passed** across three testing rounds.
</summary>

## Test environment

- Chromium 144 (headless browser automation)
- Desktop viewport: 1440 × 1000
- Mobile viewport: 390 × 844
- Pages loaded from their standalone HTML source; no external services or assets were required

## Round results

| Round | Checks | Result | Focus |
|---|---:|---|---|
| 1 — Core behavior | 8 | Passed | Page startup, node inspection, request lifecycle, pause/resume/reset, GET/POST response behavior and architecture error response |
| 2 — Functional flows | 30 | Passed | CRUD operations, query-string filtering, 200/201/400/401/404/500 responses, search/filter/sort, request-history replay, row actions, stage dependencies, debugging, tests, deployment and rollback |
| 3 — Responsive and interaction checks | 9 | Passed | Mobile overflow, navigation links, node dragging, method preview and no remote asset dependencies |
| **Total** | **47** | **47 passed · 0 failed** | |

## Improvements made during testing

1. Added guarded browser-storage access so a restricted preview origin does not prevent pages from initializing. `localStorage` persistence is used whenever the browser permits it.
2. Corrected pointer coordinate calculations so architecture nodes drag relative to the stage canvas rather than the page viewport.
3. Added selectable response outcomes to the architecture simulator and improved error-status rendering.
4. Fixed API query-string routing and made request-history replay restore the method, endpoint, JSON body and authentication toggle.
5. Enforced testing and deployment quality gates in the workflow. A failed test or rollback invalidates the affected downstream completion state.
6. Added a workflow-wide reset and improved horizontal-scroll guidance for the architecture canvas.

## Scope notes

The backend, database, testing and deployment behavior are intentionally simulated in browser JavaScript. No real Node.js server, PostgreSQL instance, cloud deployment or network API is created by this version. Browser storage persistence is implemented, with an in-memory fallback for restricted preview contexts; persistence across a real local-origin browser reload was not independently verified in this isolated preview environment.

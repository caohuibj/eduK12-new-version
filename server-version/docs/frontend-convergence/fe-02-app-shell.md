# FE-02 — AppShell, navigation and access context

Base: main `c771dbe` (merged FE-01 including its inventory and reduced-motion review fixes).

## User-visible behavior

- A shared header, account identity and navigation replace Layout / StudentLayout chrome. Those files remain compatibility exports; App.tsx mounts one AppShell outside access guards.
- Standard pages have role/capability navigation and breadcrumbs. Exactly one item matches a nested route, including course aliases and Cognitive/Situational histories.
- Focused assessment pages omit unrelated global navigation and logout. The player retains its existing exit/back and parent-unit controls. AppShell does not implement AssessmentShell, progress, save state, submission or timing.
- Public pages do not require student login; optional classroom routes still wait for initial identity resolution. Teacher/guest temporary classroom entry uses public chrome. BigScreen retains its dedicated layout.
- Portal offers the three existing roles. A signed-out shared Library link returns through Portal to the selected login without losing the destination. No Parent/Researcher login role is invented.
- Unknown, incomplete or capability-disabled URLs show an actionable message rather than redirecting silently or loading indefinitely.

## Access and navigation boundaries

`RouteAccess` owns authentication, existing roles and mandatory password change. Navigation items are presentation metadata, not authorization. API authorization stays authoritative. `access.ts` accepts only internal return URLs, rejects control characters/backslashes/encoded path separators and validates the role's destination family. Query values are decoded once by URLSearchParams; existing nested Bundle return URLs are preserved. Destination routes still apply their own guards.

The existing AuthContext retains an interrupted account/role/destination hint on authenticated expiry and forced password change. Session storage allows the hint to survive refresh in the current tab; the same context retains it when storage is denied. The guard checks the account before mounting interrupted-page children, even when query/hash decoration changes. A different account can go to its home or sign in as the original account. This is UX protection, not an authorization source or a new draft store. Loss of all browser state cannot recover that hint; existing server authorization and domain identity checks remain necessary.

Login completion uses the committed identity's role, including when a user signs into a differently labeled login page. Code-based registration, account-login links and forced password change preserve the safe destination. No logout, 401 or redirect deletes local answer data. Authentication/CSRF calls retain their existing API contracts.

## Public Cognitive entry

The route namespace chooses the client. `/public/cognitive/...` remains public without `public=1`; a `public=1` query on `/student/...` cannot switch authority. Before mounting the domain controller or report loader, a small entry boundary validates session id and presence of a saved recovery credential. Missing credentials expose a labeled input. Invalid credentials remain server-rejected and can be re-entered from the error UI. No anonymous attempt is silently created, and no authenticated fallback is used.

Parent returns are restricted to the same public/authenticated Composite route family. All trial processing, scoring, FINAL payloads, recovery algorithms and media readiness logic are unchanged.

## Presentation and accessibility

- Viewport layout and input modality are independent. Below 1024px the navigation is an inline disclosure, with native links, an expanded state and Escape/focus restoration. No modal focus trap or user-agent detection.
- Chrome links/buttons target at least 44 CSS px. Skip link targets the sole main region; path navigation focuses that region. Query changes and focused-player entry do not steal task focus.
- Product tokens are scoped to chrome and explicitly migrated Portal/auth content, not placed around player descendants. The existing player animation/timing behavior is preserved.
- Login, registration and account-profile labels are associated with their inputs. Validation messages are associated, status/error feedback is announced, and password visibility controls have accessible names.
- Global loading and route error feedback stay inside the shell. Reload recovery preserves local storage. Existing AntD notifications remain in place; no second notification or auth store is introduced.

## Scope and deferred work

The generated inventory still covers 86 routes. FE-02 changes chrome, access feedback and the described entry defects. AssessmentShell, durable answer sealing, required full-video viewing, report projection and detailed domain-page accessibility remain their planned PRs. Existing page bodies can still have their own visual inconsistencies. This PR does not assert full K12 Pilot acceptance.

## Validation / reproduction

From `server-version/frontend`:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

In another terminal from `server-version`, with the existing backend Playwright dependency and Chrome installed:

```sh
APP_SHELL_BROWSER_CHANNEL=chrome node e2e/app-shell-browser-e2e.cjs
```

Use `PLAYWRIGHT_CORE_PATH` for an existing alternative dependency location. Omit the browser-channel variable to use installed Playwright Chromium. `APP_SHELL_BASE_URL` overrides the Vite URL; `APP_SHELL_EVIDENCE_DIR` overrides `/tmp/eduk12-app-shell` screenshots/results output.

Browser acceptance runs the actual App routes with deterministic HTTP fixtures, so it performs no real server/database writes. It verifies five widths × keyboard/touch, teacher/admin menus, public credential gating, missing/disabled URLs, shared Library role selection and authenticated expiry → wrong-account block → original-account return. The storage sentinel confirms FE-02 does not delete browser data; it is not evidence of domain draft/FINAL correctness. Real-device, screen-reader and Cognitive timing acceptance remain later gates.

## Rollback

Revert FE-02 as one release if chrome/access regressions appear. Existing route paths/query contracts, APIs and stored drafts remain compatible with main before FE-02. No database or IndexedDB migration and no deployment flag change is needed. Returning to old code also restores the known public Cognitive query dependency and less helpful login recovery.

### Recorded results (2026-09-12)

- Inventory drift gate: 86 routes match.
- Typecheck and production build: passed. Existing large-chunk build warnings remain.
- ESLint: 0 errors, 115 warnings in existing files (FE-01 baseline: 118).
- Full regression run: 360 tests passed; the added forced-password-change test initially lacked AntD's matchMedia browser shim. After fixing that test harness, its focused rerun passed (361 tests covered in total).
- Final browser matrix: 16 cases passed, including explicit focus verification after navigating to login.
- 360px/1366px navigation and 360px login screenshots inspected. Browser checks use emulated input and mocked HTTP, not real classroom-device or live-backend acceptance.
- Whitespace check: passed.

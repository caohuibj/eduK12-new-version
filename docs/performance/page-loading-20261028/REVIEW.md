# Four-entry page loading and bandwidth review

Baseline main b7909cbf05d5ba0092c59853f20c86491ab38137 (PR377 merged; PR/main CI successful). User redirected the next task from additional START timing to homepage, answering-page and report-page loading/bandwidth. This review changes no application code or infrastructure.

## Built baseline, not invented network timing

One actual `npm run build -- --manifest` succeeded in21.18s. Dependencies were reused locally from the existing locked workspace, not freshly installed. Count the Vite static-import closure plus CSS for the selected entry, including common root, with each asset counted once. Gzip level1 matches current repository Nginx code-compression configuration. These numbers are cold code-transfer estimates, excluding images/fonts, API bodies, headers, browser execution, latency and cache reuse. They do not establish deployed behavior or time-to-interactive.

| Representative entry | JS+CSS files in closure | gzip1 bytes | Raw bytes |
|---|---:|---:|---:|
| Training homepage |30|290122|991625|
| Training learner home |35|294356|1013197|
| Training composite answering |57|350982|1137763|
| Training standalone Scale answering |39|308119|1029875|
| Training composite report |39|322034|1071085|
| School app entry/home shell |119|533610|1605641|
| Teacher app entry/home shell |98|458974|1313349|
| Survey researcher entry |32|150917|469233|
| Survey participant entry |17|167603|481013|

Do not infer School/Teacher answer/report incremental bytes equal the whole entry: many of those pages are already in the entry's static closure. Specific cognitive task runtimes and media can still load dynamically. Survey participant entry covers its generic answer/feedback host, not every cognitive task bundle.

Warm navigation differs greatly: after the Training homepage's code is cached, the additional composite-answer closure is72,808 gzip1 bytes and composite-report closure43,860; standalone Scale adds29,945. Cold totals must not be advertised as traffic on every page navigation.

## Existing mechanisms to retain

- `src/product-entry.ts` already dynamically selects the product host; Survey public participation is separate from researcher entry. Do not build another product router.
- Training `App.tsx` already has page-level lazy imports; Survey researcher studios also lazy-load. These are good precedents to reuse.
- Content-hashed built assets already have immutable browser caching; HTML revalidates. Code/CSS/SVG/WASM already use gzip level1. Do not present this as missing or propose a second cache by default.
- Training combined report view can return readiness and report together. Polling is bounded, honors server delays, and stops in hidden tabs; the one-second wait-label timer is not one network request per second.
- Shared image loader already deduplicates asset IDs within a load and cancels/cleans up stale generations. Runtime APIs still authorize images and personal reports.
- Survey cognitive preparation is conditional on an actual STARTED cognitive task; personal-link preloading is conditional on its identity mode. Do not replace that with preload-everything.

## Confirmed source hotspots and likely work

### 1. School and Teacher eager page dependencies: highest priority

`school/SchoolApp.tsx` and `huiteacher/HuiteacherApp.tsx` import managers, tool editors, roster panels, execution hosts and reports statically. The actual School build closure includes ScaleDefinitionEditor, ResearchFormEditor, generic CognitiveRunner/SituationalRunner and shared education studios even before the user opens those pages. Teacher has the same heavy shared-studio dependency pattern.

Reuse the existing lazy-page approach, with page-local loading/error boundaries that preserve navigation and avoid blanking the whole app. Keep server capability/role checks and unsaved-draft warnings unchanged. Do not merely split files while a second static import pulls the same implementation into the entry.

### 2. Public homepage waiting on account lookup

School gates its landing page behind `!loading`; Teacher renders a session-loading panel before its landing. Survey's public-home return occurs independently of that wait. Render appropriate non-private public content without waiting for session I/O, while preserving authenticated redirection and never showing protected workspace data before authorization. Account-navigation behavior needs explicit before/after checks; it is not permission caching.

### 3. Teacher directory requests happen before their page is needed

The `me/selectedOrg` effect loads units for every non-student organization context and members for product admins; those datasets are consumed in the organization/class-management area. `refreshOrg` also calls `reload()` (which updates `me` and triggers that effect), then fetches units directly. The code contains a duplicate-fetch path; an actual HTTP request-count trace is still required before claiming measured repeated bytes.

Use one scope-bound load owner, defer management lists until needed and show honest loading state. Preserve current organization/identity invalidation, stale-response protection, pagination and explicit refresh. School context→units also needs a consumer inventory: some home/navigation widgets use classes, so blindly delaying every request could break useful functionality.

### 4. Answering pages should load only the selected task family

SchoolCompositeRunner and Teacher assessment hosts statically include generic cognitive/SJT runners. Load heavy family-specific code when that family is needed, optionally prepare code during instructions/idle time. Do not create sessions, admit participants or reveal/prefetch restricted future stimuli merely to warm code. Timer origin and scoring/input protocols must remain unchanged; no additional timing gate or retest burden.

Training already lazy-loads routes and uses shared renderers. Survey participant entry is smaller, but eager SJT/form/media dependencies still merit a measured per-task closure review. Prefer one shared loader/promise/reset-on-failure pattern over four different caches.

### 5. Training's global stylesheet is a substantial fixed cost

The built App CSS alone is85,149 gzip1 bytes. AppShell imports multiple administrator/trainer/student/subpage styles. Determine actual role/page ownership before moving imports to page modules; keep common layout/theme/typography available to prevent flash or broken dark mode. Do not delete selectors on the basis of one screenshot.

### 6. Report requests and media: optimize missing consumers, not existing successes

Preserve bounded polling, hidden-tab suspension, current report authorization and delayed disclosure. Where an authorized first response already contains usable feedback, consume it rather than immediately fetch/decrypt it again; this connects to the existing C03 education-first-feedback work. Measure actual current response sizes and request counts before narrowing fields or adding a new API.

Decorative public assets may use appropriate responsive variants and lazy loading below the fold. Measurement stimuli, frozen media, reports and downloads have different contracts; do not compress/change their content, strip information, cache private results in shared CDN storage, or grant persistent report visibility for bandwidth savings.

## Implementation order and limited verification

1. School/Teacher page dependency boundaries and public landing wait: inspect all consumers, then one small shared lazy-loading implementation. Compare the actual built closure and missing-chunk recovery/role navigation behavior.
2. Shared answering-family preparation and Teacher list request ownership: verify that irrelevant task code/list reads are absent, correct task behavior and scope changes still work, and unsaved data is not lost.
3. Training CSS ownership plus report-first-feedback consumer reuse, selected by actual after-stage measurements.
4. For each affected homepage/answer/report, collect first-entry and cached-navigation request/transfer counts, first useful content and interactive readiness in a working browser. Local Chromium is unavailable in this DOT environment; use the already authorized bounded GitHub browser lane for genuinely missing checks, not an unrelated full platform replay.

Do not predict seconds or percentage savings from static closure alone. Preserve equal functionality, permissions, version freeze and personal-data boundaries. No new automatic admission gate, persistent permission cache, production deployment or Nginx/security setting change is included in this review.

# PR A: visual correctness and interaction consistency

Revalidated against `main` at `895be0594b6ce0405b5f4d8aed36ebc33d9284e0`.
The Modern Education direction is retained. No backend, API, scoring or authorization changes are included.

## Findings

| Handoff item | Revalidation and disposition |
| --- | --- |
| P0-1 semantic colors | Confirmed. Ordinary product utilities now consume `action`, backed by the same CSS token as ProductButton, legacy buttons and staff Ant buttons. Staff action aliases converge too. |
| P0-2 contrast | Confirmed. Auth tagline was 2.88:1 on white; now 5.47:1. Shared muted text is 5.27:1 on the page background, staff muted 5.49:1 on its page, and parent muted 5.14:1 on its soft surface. White action text remains 4.55:1. These are specified solid-color pairs, not a claim that every rendered pixel has been audited. |
| P0-3 Scale Library shell | Confirmed. Replaced result-link-dependent selectors with an explicit root for loading, error, populated, empty, filtered empty and detail. Verified all six states in real Chromium at four widths. |
| P0-4 ManagementDialog | Confirmed. Shared native ModalSurface supplies top-layer background inertness, keyboard loops, Escape, initial focus and restoration. Inline callbacks no longer restart focus effects. Applies to confirmation feedback, MaterialGrantModal and public-link management. |
| Student join dialog | Existing Tab loop and Escape were already resolved; background inertness was missing. Now shares ModalSurface while retaining initial input focus and its student styling. |
| P0-5 MediaSelector keyboard | Confirmed. Removed the interactive upload wrapper. File selection and reselect are native buttons with no interactive ancestor. Canceling reselect retains the selected file. |
| P0-6 media copy | Confirmed. Label and placeholder consistently describe HTTPS links. Bilibili, YouTube and ordinary HTTPS remain supported; HTML remains rejected. |
| P0-7 list states | Confirmed in all three named surfaces. StudentHome gets explicit retry; MediaSelector separates loading/failure/empty/search empty; GeneralQuestionnaireList no longer shows empty alongside failure. |
| P1 typography | Introduced body, secondary, metadata and micro roles. Raised auth tagline, staff headers/badges/help, report legends/status/caveats and non-timed cognitive hints selectively. |
| P1 controls | Retry uses neutral controls. Semantic action aliases preserve primary/secondary distinction; native file controls and visible modal focus are consistent. |
| P1 product copy | Removed development-phase wording from Scale Library and staff editor descriptions. Kept evidence, authorization, publication and reporting restrictions visible. |

## Scientific protection

Legacy `primary` is intentionally preserved because MemoryTask, DigitbackwardTask, CardsortTask and the fake task still consume it for task content. A global remap would alter measurement conditions. Product utilities migrate to `action` instead. Unused legacy success/warning/error definitions are retained; they have no active TSX usage. The standalone operations monitor is outside this product-surface pass.

No task TypeScript, stimulus assets, duration, response mapping, feedback timing, scoring, persistence, socket protocol, suppression, longitudinal comparability or evidence-ceiling implementation changes are included. The only task stylesheet change is the hint in CognitiveTaskIntro, before timed task presentation. Report changes are CSS only. Existing scientific restrictions remain displayed, with larger text in key reading roles.

## Additional findings

- Page stack spacing displaced a native modal backdrop by 24px. Fixed and covered by a viewport-origin assertion.
- MediaSelector had no real modal lifecycle and could accept stale library selection while loading. It now shares ModalSurface and clears library selection at fetch start; late responses from a closed or changed view are ignored.
- Media search and external/upload fields lacked associated names. Added labels; upload progress and errors are announced.
- Long document filenames could overflow a two-column mobile grid. The grid becomes one column on narrow screens and filenames wrap.
- A pre-existing `primary-hover` class had no token. The migrated `action-hover` alias is defined.
- The classroom join control's class-based selector was migrated with its action utility so its existing prominent target size remains intact.
- MEDIA-7 still located the result heading through a removed legacy card wrapper. The browser assertion now targets the report's level-one heading, preserving the video, FINAL and provenance checks.

## Validation and visual review

- Frontend full regression under required Node 24.21.0: 156 files / 599 tests passed. Final CI is authoritative for the exact PR head.
- Frontend typecheck, route inventory, session-auth gate contracts and production build passed. Lint: no errors, 119 warnings.
- Local Node 25 produced six `localStorage.clear` environment failures. All six pass under required Node 24 without changing those tests.
- Production canonical visual matrix: 63 responsive captures, plus two print captures.
- Existing staff complex-controller and classroom-control matrices: 3 captures each.
- New interaction matrix: 64 captures across 360, 390, 768 and 1440, with no page overflow or uncaught errors. Native background focus exclusion, Tab/Shift+Tab, Escape, focus restoration, file chooser Enter/Space, selected-file focus visibility and retry are asserted.
- Screenshots are stored under the Visual QA artifact's `interaction-states/` directory. Review representative `scale-populated-*`, `scale-error-*`, `student-modal-disabled-*`, `management-modal-long-title-*`, `media-selected-long-file-*` alongside canonical auth and report captures.
- Manual image review covered narrow long-title cards, error presentation, student dialog, management dialog at narrow/desktop widths, long upload filename, tablet scale filters, mobile report limitations and desktop auth. It found the backdrop offset above, which was repaired and recaptured.

## Remaining work

### Before release

- Complete required CI gates on the exact PR head; local screenshot evidence does not replace backend, Browser, Docker, CodeQL, Situational or Merge gate.
- Separate authorization review: MaterialGrantModal currently falls back to empty teacher/grant lists for nonzero responses and can enable Save after load failure. This predates this work. Fixing it crosses the explicitly protected authorization boundary, so it is recorded rather than changed here.
- Legacy hand-built staff editor dialogs outside ManagementDialog still need modality review. The shared primitive is ready for migration; this PR does not claim those independent dialogs are fixed.

### PR B / can defer

- StudentHome: refine existing course/task-entry hierarchy; do not invent aggregated pending tasks from course-only data or introduce N+1 requests.
- Scale Library: default filters occupy excessive mobile space. Use progressive disclosure, applied-filter chips and clearer card hierarchy.
- Staff high-frequency lists: replace one-dimensional mobile records with compact summaries where appropriate; retain genuinely comparative tables.
- Reports: refine reading order without changing interpretation, suppression, reference eligibility or dimension comparability.
- DocumentSelector and legacy library/editor fetch states warrant the same bounded state review; they are separate from the MediaSelector fixed here.
- Broader screen-reader testing across browser/AT combinations remains useful; real Chromium modality tests are not an all-platform accessibility certification.

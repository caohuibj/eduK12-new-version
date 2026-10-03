# Web acceptance and repairs — 2026-10-03

Production frontend/backend/worker OCI revisions and GitHub `main` were checked against `0d6848b3c3cf9fad60156922f547444cd430e31f`. Main was rechecked during acceptance and had no additional commits. This branch contains Web acceptance repairs only. Production has not been switched to this branch.

## Browser evidence and scope

The Codex in-app browser was used against the real production APIs. Synthetic student/teacher accounts, two courses, assignments, a check-in, one FORM-only course questionnaire, one Web classroom, an organization and small media files were created through normal business flows. Local baseline/candidate frontend previews reused those controlled APIs. PDF was also tested against the production build and the existing CSP. The temporary local proxy/fixture credentials are excluded from Git.

The complete private inventory has 118 routes including aliases, containers and fallback: 61 observed representative states, 5 limited read-only/catalog checks, 1 shared implementation without separate navigation, 3 disabled routes, 19 blocked by synthetic content/identity prerequisites and 29 not individually tested. These counts are not a claim that every operation or business state passed. Parent and mini-program switches stayed off; Web classroom is enabled.

The local evidence directory contains the full route matrix, 11 issue records, screen-size metadata, before/after screenshots, retests and test-data disposition. Only the four reviewed anonymous-homepage images below are committed; they contain no accounts, credentials or business data. Organization/user/report screenshots and raw browser records remain private.

## Anonymous homepage comparison

| Viewport | Before | After |
|---|---|---|
| 1280×800 | [Before](web-acceptance-2026-10-03/portal-before-1280x800.jpg) | [After](web-acceptance-2026-10-03/portal-after-1280x800.jpg) |
| 360×800 | [Before](web-acceptance-2026-10-03/portal-before-360x800.jpg) | [After](web-acceptance-2026-10-03/portal-after-360x800.jpg) |

The homepage comparison uses the immediately preceding local portal state (including the closed parent notice) and the current candidate. The additional five-viewport organization/PDF comparisons stay in the controlled local evidence directory.

## Functional repairs

- P1: relational frontend APIs used the wrong `/relational/` prefix; use the registered `/relational-assessments/` routes without changing authority.
- P1: table overflow clipped shared action menus; render the menu outside its clipping ancestor with viewport placement, dismissal and focus restoration.
- P1: document-library iframe previews were blocked by the existing resource framing headers; reuse the local PDF.js canvas viewer, with cancellation and failure/retry handling. CSP and resource permissions remain unchanged.
- P1: modern multi-course questionnaires have a null legacy `course` field and disappeared from student course detail. Match the authorized, paginated student-task projection to the current course; preserve other-course exclusion and retry on lookup failure.
- P2: closed parent entry now reflects the public capability flag. A missing flag stays closed until explicitly enabled.

## Visual and accessibility repairs

- Organization pages share brand variables, readable Chinese typography, consistent 44px controls, shrinking form columns and mobile membership cards. Move the policy card below the page title.
- Question-editor choices have room for text on phones; numeric points move onto a separate row. Inputs and icon actions have specific accessible names.
- Video deletion has a named target and 44px focusable control. Student course detail omits a blank redacted enrollment-code label.
- Classroom pages use one main landmark; question activation is a real named button and ended questions cannot be restarted from the ended classroom.
- The user found administrator discovery difficult at 476×696. Enabled homepage roles now precede the closed parent card, with two-column mobile cards and visible entry hints. Before: admin begins at y=730; after: y=527–659, inside that viewport. The five requested viewports were also rendered and checked.

## Retests

The real student assignment and check-in survive refresh. Amending the same assignment leaves one submission. A FORM-only questionnaire was created and published with explicitly synthetic content, required-field validation was checked, local draft was saved/exited/restored, mobile FINAL submission completed, and refreshing the report returned the same response. The teacher result list contains one completed attempt. No scientific scale was published for visual filler.

The real Web classroom synchronized teacher/student state and recorded one answer with 100% submission; question and classroom were ended. Export payload generation returned one question/one answer/one participant. Download landing and video playback-time progression were not confirmed. PDF decoded and rendered in desktop/phone production-CSP previews; document soft delete and administrator recovery were verified, with final soft-deleted state.

Organization overflow at 1280 (1312px content versus 1265px available) and phones (528px versus 390/360px) is resolved. Full before/after overview screenshots cover 1440×900, 1280×800, 768×1024, 390×844 and 360×800. Other organization subpages were checked mostly in desktop empty states; shared CSS is not a claim of individual mobile action coverage.

## Validation and remaining limits

Frontend lint has zero errors and existing warnings; app/cognitive typechecks and production build with the cognitive flag pass. Full frontend regression passes 177 test files / 718 tests, including the new portal order test. Local lint has 107 existing warnings. The host Node is 25.2.1, so local Vitest used `--no-experimental-webstorage`; the repository CI remains on supported Node 24.21.0. Backend public-capability regression/build are recorded there; the complete isolated database/browser/container/security gate is left to the exact-head CI result, not inferred from local tests.

Still untested: some public/anonymous study flows, scientific runners without approved synthetic prerequisites, historical answer/details, every failure/expired-session combination and actual 200% browser zoom. COUNSELOR/CLIENT additions and final account/organization cleanup await the user's action-time confirmation after an automatic approval-review rejection. No existing account password or active state was changed. The earlier controlled custody membership for the existing manually signed-in platform administrator is recorded privately; it is not an automatic entitlement to others' reports.

Two synthetic courses are ended with recruitment off; the questionnaire is archived with new attempts disabled; classroom is ended; PDF is soft deleted and raw files/answers are retained for reproduction. The zero-track run remains a non-published draft (cancel requires PUBLISHED). Synthetic image/video are retained rather than physically purged. Test accounts and organization are still active pending approved membership cleanup; this is an outstanding completion item.

## Deployment and rollback

Do not merge/deploy as part of this PR. Present the exact-head CI result, local screenshot comparisons and remaining limitations to the user first. No schema migration, backfill, access broadening or runtime DB permission change is required. If approved later, retain the current production frontend/backend image digests and compose manifest, deploy the reviewed images, smoke the affected flows, and restore those previous image digests on regression. Keep migration data, original media and backups intact.

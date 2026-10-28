# School observers and Teacher external expert follow-up

Base: main `90c0a9a5c0ba24a5a9d8cb8003279dfb668650ba` (merged PR374).
User requested School parent/teacher and Teacher external expert in the next PR.

## Current evidence

- Existing real PostgreSQL services: 3 selected tests PASS. School PARENT_REPORT / TEACHER_REPORT complete authorized observer scales; Teacher expert completes frozen field forms with separate private reflections. The existing School test mocks HTTP identity transport; it is not login evidence.
- New actual HTTP test: 3 cases PASS in `observer-http-r4.json`. Password login, product cookie, CSRF, current database authorization and product routers are real, not mocks or fabricated JWTs. Test accounts, source content, approved relationships, manager permissions and publication setup are synthetic. Setup is not a manager browser or registration UI acceptance claim.
- School parent/teacher: visible assigned task → required consent → START → current frozen item → FINAL → identical replay → changed replay 409 → completed re-open → one persisted immutable FINAL with distinct respondent and subject → individual report denied, unauthenticated read denied.
- Teacher external expert: real invitation registration → consumed invitation rejected → actual login → no organization membership created → own invited form read → private reflection and formal feedback → final structured evidence persisted encrypted → duplicate rejected → formal/private separation → non-manager formal list denied → anonymous read denied → revoked invitation access rejected.
- The external expert journey is the established CLASSROOM field-observation FORM mechanism, NOT proof that arbitrary public-library SCALE/SJT/cognitive tools support an external expert.
- School uses an explicitly observer-capable synthetic scale. The PR374 C1 SELF fixture is not repurposed for parent/teacher reports, and no research validity or real-minor suitability is implied.
- No business auth, runtime, report, database schema or content activation changes were required by these checks.

## First failures retained

The original reports remain under `evidence/`; failures are not rewritten as passes.
1. HTTP r1/r2: the new test mistakenly used `items` progress summaries instead of the runner's `currentItem`. Missing definitionHash caused a 400 before submission. The runner already uses currentItem correctly. r2 additionally used the existing runner's attemptEpoch fallback; this was not the actual missing-string cause.
2. HTTP r3: the helper called response.json() on an intentionally empty response; business flows had reached their later assertions. The original report lacks a precise request trace, so it is NOT counted as a full passed journey. The final client correctly accepts empty bodies.
3. Expert HTTP r1: the fixture attempted to OPEN a field event before an accepted observer existed. The real service correctly rejected it. Corrected setup registers the invite first, then opens the event.
4. HTTP r4: all three cases pass with the corrected test; no production guard relaxed. Previous PostgreSQL services were not rerun as substitute evidence.

## Remaining scope

- Browser/visual route consumers remain NOTRUN for these three roles; HTTP is not browser acceptance.
- The only planned application change is the scoped Training dark Scale warning-list contrast repair, preserving light/print themes and policy text.
- Expert structured field answers currently remain in-page until FINAL, while narrative draft is encrypted on the server. Existing UI explicitly states this distinction. Cross-reload answer persistence is not proven or silently added here.
- Formal CI admission and merge qualification remain pending. No deployment, production registration, permission expansion or content activation.

## Minimal check plan

New HTTP test → real login/route serialization and identity failures → isolated local PostgreSQL/Redis (complete).
Existing role services → observer population and privacy → isolated local PostgreSQL (complete, no repeat).
Scoped warning color → dark contrast and light/print preservation → sandboxed GitHub Chrome (pending; local Chromium unavailable as documented in PR374).
Type correctness → new backend test imports/fixtures → local TypeScript (PASS, original shell exit 0; retrospective exact backend tree association).
CI → exact complete source diff, formally admitted originals and missing UI evidence, changed-source CodeQL and stable merge gate. No unrelated full application replay or production build by default.

## First formal CI (40639538698)

Source6894ba96cddd4881e5d3d2292375d551cf650ddf, merge checkout190c3ddbc86723206cc4af30cf8051ca9a00ad06. Source and original admission PASS; CodeQL job PASS. Three role browser consumers PASS and root read all screenshots. Dark warning first case FAIL, later tablet/light-print NOTRUN; overall qualification failed. Original browser JSON preserved, artifact12795300037 ZIP SHA256 f9d333139d0afafca6e1ca510ed4651a4d7f02e9cce6599ae3a7096b16910b37.

The new display harness omitted actual Training shell data-shell-mode, required by the dark-token selector. Computed warning foreground was light-theme ink rgb(41,45,43), background rgb(37,48,41), ratio1.019. Restore the real shell attribute; do not bypass theme setup or relax 4.5. Separately make the warning p/ul selector equal in specificity to existing report-feedback p so later warning color wins intentionally. No importance override or runtime changes.

Retry only failed/unexecuted warning displays. Preserve and admit exactly the previous three PASS role UI rows from the immutable overall FAIL report; current frontend differs only in report-ui.css, whose Training-scoped change does not touch School/Teacher hosts. Role fixture/consumer behavior unchanged; data-shell-mode is added for report view only. Original role screenshots remain in the first artifact, not regenerated. New control script gets current SAST. No application/PG/type replay.

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
Type correctness → new backend test imports/fixtures → local TypeScript (pending at initial documentation).
CI → exact complete source diff, formally admitted originals and missing UI evidence, changed-source CodeQL and stable merge gate. No unrelated full application replay or production build by default.

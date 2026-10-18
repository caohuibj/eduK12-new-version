# C14 HTTP harness contract audit

Static review against source HEAD `bbabf040eeb59a6fc3d018418c3eecf8897995e3` on 2026-10-18.
This is a route/DTO/fixture review, not a claim that HTTP03 passed. HTTP01/02 failure evidence is preserved. No production source or dist changes are required by these fixes.

## Differences corrected before the next run

1. Course product domains are immutable. The shared helper creates a new `TRAINING_COURSE`, copies membership, checks the separately supplied source owner, and leaves the source course unchanged.
2. SJT grant `granteeTeacherId` and `courseId` are UUID DTOs. New actors now have UUID IDs and separate prefixed usernames. A new approved Training teacher owns the new course, Scale clones and Cognitive assignment clones. Existing seed admin/student IDs remain valid plain-string authenticated identities, as in the qualified C13 harness.
3. Copy intentionally resets public delivery. `copyProduct` now checks the reset and sends a revisioned `PUT /questionnaire-products/:id` with the new name, course, `publicEnabled:true` and expiry before publishing.
4. Token expiry must not exceed the parent expiry. Tokens now use 30 minutes capped at the actual published parent expiry, instead of regenerating a later one-hour deadline. This matches C13's shorter token-window pattern.
5. Evidence counts use the looked-up student ID rather than assuming username equals ID. New actors explicitly use the `TRAINING` domain. The course helper verifies active, unfrozen, approved teacher/domain/expiry facts.
6. The wrapper now refuses any Node version other than `v24.21.0` before starting services.
7. Added the missing real restart-versus-FINAL contention in both orders. Separate PostgreSQL connections gate the old parent attempt row; `pg_blocking_pids` proves both HTTP operations queued. The worker is paused only after verifying its PID/cwd/cmdline and always resumed in `finally`. Losing FINAL leaves no accepted receipt, raw fact or snapshot; losing restart leaves no extra allocation/child/job. The winning attempt completes via the original worker.

## Actor and entry contract

- `GET /auth/csrf` precedes each independent client. Cookie jar forwards `ptool_csrf` as `x-csrf-token`.
- `POST /auth/login`: ADMIN sends only username/password. `POST /auth/training-login`: TEACHER/STUDENT additionally send the exact expectedRole. No admin is routed through the Training-only entrance.
- Source: `controllers/authController.ts:20-24,80-104`, `middleware/auth.ts:54-64`, `prisma/schema.prisma:15-35`.
- C13 comparison: `c13-sjt-smoke.mjs:34,112-122`; C14 keeps the same official login split, new UUID teacher, new Training course, and existing seed student's valid membership approach.
- New synthetic scaffolding is limited to accounts, course/membership and resource definitions. No product/attempt/allocation/answer/result/job is fabricated.

## Complete HTTP request-family checklist

All paths below are relative to `/api`. `C` is `/composite-assessments`, `P` is `/public/composite-assessments`, `Q` is `/questionnaire-products`, and `S` is `/situational/authoring`.

| Current requests | Contract checked | Result |
|---|---|---|
| GET `/auth/csrf`; POST `/auth/login`, `/auth/training-login` | Strict login body, correct role entrance, real cookies/CSRF; no fabricated session | Matched |
| POST `S/media/images` | Multipart field `image`, PNG Blob, valid PNG bytes; no JSON Content-Type override | Matched |
| POST `S/online/drafts` | `{template,authorizationPolicy:'COURSE_GRANT_V1'}`; key within limit; unchanged valid golden response/template | Matched |
| POST `S/drafts/:id/request-review`; POST `.../review`; GET `S/drafts/:id` | Revision/contentDigest; independent ADMIN adds approve/note; request-review does not increment revision | Matched |
| POST `S/releases/:id/grants` | Exact instrument key/version/definitionHash/contentDigest; UUID teacher/course; `TRAINING_COURSE`, `DISTRIBUTE`, ISO times, note | UUID fixture corrected |
| POST `S/grants/:id/revoke` | Current version and nonblank note, ADMIN actor | Matched |
| POST `Q` | UUID requestId, name, `COURSE`, one owned real Training course, publicEnabled, ISO expiry | Matched |
| POST `Q/:id/items` | Revision and strict item object; FORM text_input+label, SCALE scaleId, COGNITIVE assignmentId, SITUATIONAL exact semantic version; all required | Matched |
| POST `Q/:id/training-variants` | Revision; schemaVersion 1; 2 groups; keys a/b; integer weights 1/2; ITEM/FORM_SECTION whole-unit references; maxAttempts 2/3 | Matched; malformed cases deliberate |
| GET `Q/:id`; POST `.../preflight`, `.../publish`, `.../archive` | Owner authorization; `{revision}` only; latest returned revision reused | Matched |
| POST `Q/:id/copy`; PUT `Q/:id` | Copy body only UUID requestId; edit body revision/name/courseIds/publicEnabled/expiry; no questionnaireType on edit | Delivery reset corrected |
| POST `C/:id/attempts`; POST `C/attempts/:id/restart` | STUDENT role, existing active course membership, empty body, identity from authenticated principal | Matched |
| POST `C/:id/public-tokens`; DELETE `.../public-tokens/:tokenId` | Owner; expiry and integer maxUses within limits; DELETE has no payload | Expiry bound corrected |
| GET `P/:token`; POST `P/:token/start` | Fresh start `{}`; resume `{recoveryToken}` only; token comes from server and is redacted in evidence | Matched |
| GET `C/attempts/:id`, `P/attempts/:id`; POST `P/attempts/:id/restart` | User ownership or `x-recovery-token`; body has no participant/group selector | Matched |
| POST `C/P/attempts/:id/form-sections/:sectionId/submit` | submissionId, positive attemptEpoch, definitionHash, nullable contextSnapshotHash; answers formItemId/value | Matched |
| POST `C/P/attempts/:id/items/:itemId/scale/submit` | Same runtime binding; itemCode/responseValue/optional nonnegative responseTimeMs; answer `yes` exists in source response set | Matched |
| POST `/cognitive/sessions` | Strict assignmentId-only body, STUDENT actor; hidden published wrapper is deliberately denied | Matched |
| POST `/cognitive/sessions/:id/submit` | Strict authenticated FINAL DTO; 120 valid Go/No-Go trial envelopes from delivered seed/config | Matched |
| POST `/public/cognitive/sessions/:id/submit` | Same FINAL DTO plus required body recoveryToken, using the current parent credential | Matched |
| GET `C/P/attempts/:id/items/:itemId/situational/:childId` | Exact nested parent/item/child identity; authenticated ownership or header recovery token | Matched |
| POST preceding SJT path + `/submit` | UUID submissionId; runtime epoch/hash/compiled hash/scoringVersion; responseProtocol and original golden responses; no illegal context or body recovery fields | Matched |
| GET Form/Scale/SJT `.../assets/:assetId/content` | Existing route shapes and real uploaded asset UUID; hidden item/section probes use valid but unselected IDs | Matched denial probes |
| POST Form `.../items/:itemId/options/0/video-capability`; Scale `.../items/:itemCode/video-capability`; GET SJT `.../scenes/:sceneKey/video-sources` | Existing paths; valid nonnegative option index; authorized nested scope checked before presentation availability | Matched denial probes; no successful video claim |
| GET `C/P/attempts/:id/report-status`, `.../report`; GET `C/:id/attempts/:attemptId/report` | Participant/recovery versus owner routes; no extra query fields; wait for original job READY | Matched |
| GET `C/attempts/:id/whole/definition`; POST `.../whole/submit` | Positive epoch, required nullable contextSnapshotHash, 64-hex slotSetHash, strict selected Scale unit DTO; item options read from runner definition; no client group | Matched |
| POST `C/:id/export` | `{detail:'full',format:'csv'|'zip'}`; defaults anonymize; no unsupported format | Matched |
| GET returned export artifact URL + `/status`; GET artifact URL | Server-returned URL, owner queue poll/download; other teacher denied | Matched |
| GET `C/:id/variant-analysis` | Owner-only read, no request body; other teacher denied | Matched |

## Source references for the checklist

- Questionnaire: `modules/questionnaire-product/routes.ts`, `service.ts:33-52,101-136,174-210,268-350,409-535`; scope in `training-variant-authoring.ts`; core group schema in `modules/assessment-core/weighted-variants.ts:8-28`.
- Composite paths: `modules/composite/composite.routes.ts:70-161`, `composite.public.routes.ts:12-40`; controller parsing at `composite.controller.ts:384-429,528-568,705-725,755-790`.
- Form/Scale FINAL: `services/questionnaire-final-submit.schema.ts`, `services/scale-final-submit.schema.ts`.
- Whole FINAL: `modules/composite/whole-questionnaire.service.ts:27-33,159-192,260-314`; parent CAS/receipt behavior in `modules/assessment-runtime/report-outbox.service.ts:378-470` and `whole-receipt-atomic.ts:25-112`.
- Cognitive: `modules/cognitive/cognitive.routes.ts:77-84`, `cognitive.public.routes.ts:14-19`, `cognitive.schema.ts:168-185,199-205`, controller `:265-282,436-472`; source fixture is `e2e/questionnaire-products-fixture.ts:72-80`.
- SJT: `routes/sjtAuthoring.ts:83-88,163-167,201-225,339-350`; `routes/sjtAuthoringMedia.ts:25-42`; `modules/situational/authoring/grants.ts:31-50,128-175`; `situational-final-submit.schema.ts:26-45`; `situational-runtime.service.ts:201-225,258-259,307-341`.
- Media: `modules/composite/composite-image.controller.ts:91-151`, `composite-video.controller.ts:21-110`.
- Tokens: `modules/composite/composite.schema.ts:132-135`; `composite.service.ts:2106-2136,2947-3001`.
- Export/report: `modules/composite/composite.schema.ts:141-164`, `composite-export.controller.ts:40-94`, `services/assessmentExportHttp.ts`, `services/exportJobService.ts:42,95-100`.

## Scope of evidence

Only a successful subsequent isolated runtime run can qualify these scenarios. Hidden SJT requests combine a hidden item ID with an existing selected child ID, so they qualify cross-slot denial and unchanged row counts, not an independently reachable hidden-child selection guard. The image-only SJT fixture does not qualify successful selected-video capability isolation. Browser, load, CPU and latency remain unqualified. Sampling remains bounded natural production randomness, with every sampled four-tool attempt actually answered; it is not a distribution or acceleration benchmark.

## HTTP03 asynchronous completion checkpoint (2026-10-18)

HTTP03 genuinely passed initial authoring/publication, both groups' invalid Scale/Cognitive admission denials, and the first candidate participant's four FINAL/replay/restart-denial operations. Its aggregate stays failed: the harness attempted a fifth unit while the report was still pending, and the original worker separately reported a definition mismatch. It did not qualify completed reports, exports or later races.

The revised finish helper requires exactly four answered units and four completed canonical snapshots, then polls the original report-status before asserting final parent COMPLETED. An empty currentItem alone is never accepted as completion.

`c14-variants-resume.py` is a narrowly scoped HTTP03 checkpoint continuation, not a generic replay. It verifies the stopped source, clones PGdata and local media, preserves encryption identities, starts only the clone, and retains source/current revision and runtime-fingerprint provenance separately. No migration or old source mutation occurs. The smoke resume branch requires the exact 10-check/1-allocation/0-completed checkpoint, rebuilds owner/course/release/grant references from the cloned rows, authenticates the existing participant, and verifies immutable allocation/raw/canonical bytes before and after report completion. Non-compact Scale's accepted facts are retained on the Assessment row; a zero AssessmentResultFact count in HTTP03 is preserved rather than fabricated.

Only if the original report is FAILED does the existing authenticated `POST /composite-assessments/attempts/:id/report-retry` run once. That endpoint retries report processing, not answers. Old FINAL/replay payloads, invalid-candidate mutations and authoring/publication are not repeated. Original checks are placed under reusedEvidence with their original source binding; they are not counted as newly passed current-runtime requests. Remaining main-chain scenarios use fresh attempts and the normal HTTP APIs. The wrapper refuses any other checkpoint shape rather than silently repeating passed work.

# FE-05 — ReportShell + Reporting Convergence

Base implementation: Frontend Product Convergence v1.2 / FE-05.

## Purpose

FE-05 converges the product-level report frame without creating a report engine in the browser. Domain and server projections remain authoritative for metrics, interpretation, quality, audience filtering, snapshot selection and scientific meaning.

The immediate product defect closed by this work is that Composite reports already carried `SITUATIONAL` unit projections but the frontend dispatched only Scale and Cognitive content, producing a titled card with no body.

## Presentation boundary

`ReportShell` owns only:

- page title and description;
- completion facts;
- report-read / completed status presentation;
- report action layout;
- limitations layout;
- responsive report-width composition.

It does **not** own or calculate:

- scores, metrics or aggregates;
- reference distributions, percentiles or interpretation bands;
- quality validity rules;
- audience authorization or field filtering;
- report package generation;
- Snapshot generation or selection;
- export payload generation;
- FINAL, CanonicalUnitResult or runtime identity.

Scale and Cognitive keep their existing scientific content components and guards. Situational now has a reusable report-content component that can render the richer frozen standalone projection and a reduced Composite projection without consulting the latest content catalog.

## Routes and audience

| Route | Audience / authority | FE-05 behavior |
| --- | --- | --- |
| `/student/scales/assessments/:assessmentId/result` | authenticated participant | Shared ReportShell; existing Scale report content; read failure is distinct from submission failure. |
| Cognitive result routes | authenticated/public Cognitive authority | Existing Cognitive result authority and content retained; reusable single-task content uses context-appropriate heading levels. Cognitive runtime/player migration remains FE-07A/07B. |
| `/student/situational/attempts/:attemptId/result` | authenticated participant | Shared ReportShell + frozen Situational report content; existing JSON/CSV export retained. |
| `/student/composite/attempts/:attemptId/report` | authenticated participant | Shared ReportShell; Scale/Cognitive/Situational unit dispatch. |
| `/public/composite/attempts/:attemptId/report` | recovery-authorized public participant | Same report frame over public server projection; no staff Snapshot controls. |
| `/composite-assessments/:id/attempts/:attemptId/report` | TEACHER / ADMIN | Same report frame over `teacherReport`; Snapshot history/export remains staff-authorized. |

There is no production Parent/Observer report binding in the current route inventory. FE-05 therefore does not claim a parent projection or invent a client-side parent role path; the inventory remains explicit for later FE-10 closure.

## Audience and data-minimization rule

The frontend does not fetch a maximal researcher report and hide fields with CSS. Existing route-specific APIs remain the authority:

- participant report → participant endpoint;
- public/recovery report → public capability/recovery endpoint;
- teacher/admin report → staff endpoint and server-authorized audience projection.

FE-05 adds no API that widens the response surface and adds no client-side scientific redaction layer.

## Snapshot and export identity

Composite staff reports preserve the existing version rule:

1. an explicit `snapshotId` in the report URL selects that authorized Snapshot;
2. otherwise the report's completion/default Snapshot remains current;
3. analysis export uses the explicit selection when present, otherwise the `packageReport.snapshotId` shown on screen;
4. changing the report frame does not recompute or aggregate results in the browser.

Thus screen and export remain on the same server-authorized frozen version.

## Situational frozen projection rule

Standalone Situational responses include the frozen instrument report definition, so FE-05 can render frozen metric labels, Construct × Channel metadata, interpretation text, disclaimer and limitations.

The current Composite Situational unit projection is intentionally narrower and may contain only metric keys/values plus quality and frozen identity. When label or interpretation text is absent:

- render the available frozen key/value faithfully;
- keep `0` distinct from `null` / unavailable;
- explain the missing frozen presentation metadata;
- **never** query or import the latest Situational catalog to decorate an old result.

### Minimal future contract improvement

If product requirements later require the Composite unit card to match the rich standalone Situational report exactly, the smallest safe backend/report-projection addition is to freeze/project the relevant report-presentation fields with the unit result (metric label, construct/channel presentation, display precision/range, interpretation text, disclaimer/limitations). It must be version-bound to the completed result/Snapshot rather than looked up from the current catalog. FE-05 does not require this addition to eliminate the current empty-card defect.

## Compatibility and network impact

- no database or IndexedDB schema change;
- no new answer/trial/media-progress writes;
- no FINAL or CanonicalUnitResult change;
- no new report fetch for the shared shell;
- existing Snapshot and export requests remain unchanged;
- existing attempts and frozen results require no migration.

## Validation targets

Focused tests cover:

- ReportShell heading/facts/status/actions/limitations;
- Scale result read failure vs completed result semantics;
- Situational zero vs missing values and fail-closed decrypt behavior;
- standalone Situational preservation of frozen labels/interpretation/limitations;
- Composite Situational dispatch so a unit cannot silently render as an empty titled card;
- Cognitive embedded heading hierarchy without changing its quality/scientific content.

Repository Ready CI remains the merge gate for full frontend/backend regression, build, browser acceptance, CodeQL and image/container checks applicable to the exact candidate SHA.

## Rollback

Revert FE-05 presentation changes and restore the prior domain page frames. Domain report content, route-specific APIs, Snapshot identity, exports and stored results remain compatible; no data migration or runtime rollback is required.

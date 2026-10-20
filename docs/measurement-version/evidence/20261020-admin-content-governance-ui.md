# Existing admin content governance UI: local implementation evidence

Scope: the existing system administration content-permissions section only. This
is not a new SJT editor, new scientific authority, production publication, or
completed V10 acceptance. No real grant, source permission, publication, account,
or production state was changed during this unit.

## Implemented

- The existing root grant form now has fixed Training course report, reference,
  and data-reinterpretation purposes, plus the exact platform reference-governance
  and installed-SJT measurement publication scopes. Switching purpose clears
  old resources, capabilities, and delegation selections. Course scope requires
  actual course UUIDs; platform scope IDs are fixed and not editable.
- Training course reference grants name composite UUIDs and only
  `reference.analyze/review/publish`; course data grants name completed attempt
  UUIDs and only `data.reinterpret`. Platform reference governance names exact
  measurement release UUIDs and only `reference.review/publish`, never analyze.
  The form identifies approved business teacher eligibility, independent review,
  qualification/purpose, and the server's current-scope authority. No admin role
  is interpreted as scientific approval or personal-data access.
- Installed SJT preparation accepts the exact registry instrument key/version.
  It shows the actual mapping UUID and digest, then explicitly fills (but does
  not submit) a root grant for the current publisher. The grant scope is exactly
  `TRAINING / PLATFORM / situational-registry / measurement / [mappingId]`, with
  only `measurement.publish`. Issuance remains a separate confirmed operation.
- SJT publication separately requires the real grant UUID plus locale, territory,
  explicitly chosen commercial nature, and the exact source-license grantee.
  No locale, territory, commercial purpose, or source license is invented.
  Preparation does not grant a license. An already mapped release does not prove
  that the current deployment or license has been checked. Backend APIs remain
  authoritative for installation, current grants, eligibility, and source rights.
- All operations reuse the existing API client/session/CSRF path and the existing
  page's security-key step-up control. Strong-key interruptions keep the exact
  request; no fake proof or client-side privilege is sent.
- Pending root issuance, SJT prepare/publication, and revocation preserve the
  current actor's exact request in session storage. Actor changes remount the
  state boundary. Unknown outcomes freeze original request IDs, versions,
  source identity, grant ID, deployment, and reasons; a later denial cannot erase
  earlier uncertainty. Duplicate in-flight clicks are suppressed. No automatic
  mutation runs on mount or after restoring a pending request.
- A definitive first rejection with no earlier unknown outcome permits correction.
  Root issuance can also end after reading the same issuer/root/grant content.
  Revocation can end after reading that exact grant actually revoked. Unrelated
  IDs, altered grant content, incomplete/mismatched responses, invalid saved
  scope, and unavailable storage cannot become successful confirmations.
  Storage errors are surfaced and unresolved operations protect unload.

## Checks

Primary execution position: the shared cloud development checkout, with reused
installed dependencies, Node v24.19.0, Vitest v4.1.11. No install or full build.

- `vitest run src/admin/AdminContentPermissions.test.tsx src/admin/AdminStaticSjtPublication.test.tsx --maxWorkers=2`: 36 tests passed.
- ESLint on the two components, two tests, recovery helper, and API DTO/client
  module passed with no diagnostics.
- `git diff --check` passed for this unit's exact paths.
- An early invocation used the wrong working-directory-relative test path; the
  prior grant fixtures also needed the real request-ID/metadata contract. The
  fixtures were corrected, with explicit mismatched-ID/body rejection tests
  retained. Passing evidence above is the final impacted run, not an assertion
  that every earlier attempt passed.
- An integrated frontend type run by another unit reported the new mapping
  type guard's narrowing order. The guard was corrected, including the analogous
  metadata check. No duplicate full type run was started here; centralized final
  app type acceptance remains pending.

The checks use synthetic API DTOs and do not prove actual browser rendering,
strong-key hardware behavior, HTTP permissions, PostgreSQL migration/races, or
production source licensing. Those remain centralized integration/acceptance
items. This unit does not rerun the separate static-SJT backend checks, launch CI,
push the branch, or change backend files.

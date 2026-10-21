# Training workspace libraries (local development)

Implemented on `feat/training-workspace-libraries-20261021`, based on local
commit `277b3717b11208a94d3daf1eb492aa75dcd1f46e`. No GitHub push, CI or production
deployment is part of this change.

## Teacher workflow

- Peer navigation: 我的课程 / 媒体库 / 工具包. Course card paging remains 2/6/10.
- Each area has server-side search. Library type/source filtering precedes
  pagination; libraries show 12 results per page.
- Media reuses existing uploads and previews (video, images and PDF documents).
  Renaming changes display metadata, retaining file identities and references.
  The Training media picker uses the same authorized catalog.
- Toolkit includes own scales, independent forms, composition definitions and
  SJT drafts, plus eligible cognitive/SJT catalogs and authorized fixed bundles.
  Own published tools create independent drafts for updates. Scale copy
  eligibility and scientific publication checks remain authoritative.
- Course assessment editing links to `/toolkit/compositions/:id` for cognitive
  configuration publication, reference/report selection and private course
  reports. These retain their existing measurement, course, grant and revision
  scope. Unconfirmed mutations still block ordinary course editing after reload.
- Scientific governance is loaded only when its toolkit disclosure is opened.

## Authorization and persistence

`MEDIA_ASSET` grants authorize one exact independent stored file. Course-private
attachments, public check-in submissions, authorization evidence and generated
video derivatives cannot acquire this permission. Ownership is still required
for renaming. Revocation blocks subsequent library reads and new attachments;
existing published parent references keep their original lifecycle semantics.

`FORM_TEMPLATE` grants permit copying an exact published independent GENERAL
form into a new private draft. They do not authorize reading responses, access
tokens or editing the source. Forms containing scales require separate scale
authorization and do not qualify for this grant. Copying preserves form section
content/order with new identities and no attempts, responses or tokens.

Grants use the existing administrator-only material grant API and feature flag;
the workbench never grants itself access. SJT course grants retain exact release,
hash, purpose, course, permission and validity checks. A new SJT draft retains
adaptation provenance and its associated grant checks.

Two additive enum migrations were applied only to the local database after
verified custom-format backups. Backups, private runtime configuration and
check logs remain outside Git in `../eduk12-local-runtime/`.

## Verification

Targeted frontend checks cover navigation, search/filtering, page-size retention,
media selection/rename, version-copy actions, course editor migration and recovery
guards. Targeted PostgreSQL fixtures cover exact media permissions, revocation,
immutable asset identity, metadata pagination, SJT version copying and granted
form copies. All fixtures are disposable and removed by test teardown.

Frontend/backend type checks and changed frontend lint are local checks. No full
application build, full test suite, CI or production acceptance is claimed.

# Dependency-only continuation of PR427 image qualification

The user-provided Trivy report identifies CVE-2026-116689 in follow-redirects1.16.1; the vulnerability database downloaded successfully. This is an actual package finding, not the separate cloud job-log download403. The denied log download is not retried.

Official confirmation: https://github.com/advisories/GHSA-mrwp-f3q8-3g9p and https://github.com/follow-redirects/follow-redirects/releases/tag/v1.16.2. The official npm1.16.2 integrity is pinned in the backend lock. Axios1.20.0 accepts ^1.16.0; the backend's explicit1.16.1 override had held it back. The published patch changes cross-realm sensitiveHeaders array recognition; the advisory does not claim the app's Axios path was exploited.

Only the backend override and corresponding lock entry change. Docker npm-ci → prod-deps prune → runtime copy explains why the old production image contained this package. The new production image must be built and scanned; there are no ignore rules, severity changes, scanner changes or new scan system.

One isolated local loopback HTTP compatibility invocation passed: cross-realm sensitive header removed on a cross-origin redirect; same-origin custom header retained; Axios1.20.0 redirect works with follow-redirects1.16.2. Only synthetic strings were sent. It used local Node24.19 (library supports Node>=4), not the formal production Node24.21; the latter remains covered by the necessary existing image job. No backend business, FINAL or lifecycle suite was replayed.

The existing qualification verifier now recognizes this exact dependency-only continuation: all other package records, scripts/engines, Prisma schema, native qualification code/job and frontend inputs must remain equal, and the prior official job must have actually succeeded. The lock graph shows follow-redirects is referenced only by Axios, whose only parent is the application root; Prisma tooling does not use it. Native and frontend results from job124438146565/run41167481038 are reused. Backend audit cannot reuse the old changed lock and runs once. The changed CI verifier requires bounded CodeQL; image build/scans remain required.

The first local reuse-control invocation was deliberately before a new Git commit existed and the immutable HEAD-diff assertion rejected it (HEAD still4e28). That failure is retained, not weakened into accepting working-tree state. The same new contract is executed on the actual committed patch. No formal image success is claimed yet.

The failed previous image job retained no reusable image archive. Its build step success is preserved as history; current patched runtime image build and both still-required scans cannot be replaced by that incomplete prior job. This limitation does not justify replaying successful database/frontend checks.

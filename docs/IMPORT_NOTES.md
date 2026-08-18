# Import Notes — eduK12 server-version baseline

This document records exactly how the `server-version/` subtree was imported from
the legacy `caohuibj/eduk12` repository, so that the fork point is reconstructable
months later.

## Source provenance

- **Source repository:** `caohuibj/eduk12`
- **Source branch:** `master`
- **Source commit:** `2b9a11d97562b253bc3777565303d33e38de28a9`
- **Imported scope:** `server-version/`

## Verification at import time

- `git cat-file -t 2b9a11d97562b253bc3777565303d33e38de28a9` → `commit` ✅
- `git ls-tree 2b9a11d97562b253bc3777565303d33e38de28a9 -- server-version` →
  `040000 tree a89321d7dd13099bfb56df09d9a6800256fb40bf server-version` ✅

So the imported content corresponds to the subtree `server-version` at the exact
baseline commit above.

## Process

1. Cloned the empty main repo `caohuibj/eduK12-new-version` (default branch `main`).
2. Added the legacy repo as a source remote:
   `git remote add source-eduk12 https://github.com/caohuibj/eduk12.git`
3. Fetched `source-eduk12 master`.
4. Created branch `import/server-version`.
5. Checked out the subtree from the fixed commit:
   `git checkout 2b9a11d97562b253bc3777565303d33e38de28a9 -- server-version`
6. Committed with message `chore: import eduk12 server-version baseline`.
7. Pushed the branch and merged it into `main`.
8. Tagged the resulting commit:
   - `upstream-eduk12-server-v1`
   - `local-baseline-v1`

## Intentional decisions

- `backend/` and `frontend/` were **not** promoted to the repository root. The
  goal of this first step was a faithful baseline, not a directory refactor.
- `.deploy/` holds local-only SSH deploy keys and is excluded via `.gitignore`;
  it is never part of the committed tree.

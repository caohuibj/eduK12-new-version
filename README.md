# eduK12-new-version

This repository is the canonical development mainline for the eduK12 server-side
system. It was bootstrapped by importing the `server-version/` subtree from the
legacy `caohuibj/eduk12` repository at a fixed baseline commit, so that all future
work forks from a known, verifiable point.

## Provenance (baseline import)

| Field | Value |
|-------|-------|
| Source repository | `caohuibj/eduk12` |
| Source branch | `master` |
| Source commit | `2b9a11d97562b253bc3777565303d33e38de28a9` |
| Imported scope | `server-version/` |
| Import branch | `import/server-version` (merged into `main`) |
| Tags | `upstream-eduk12-server-v1`, `local-baseline-v1` |

## Layout

```
eduK12-new-version/
├── server-version/        # imported verbatim from the baseline commit
│   ├── backend/
│   ├── frontend/
│   ├── nginx/
│   ├── docker-compose.yml
│   └── ...
├── docs/                  # import notes & project documentation
├── .deploy/               # local-only SSH deploy keys (gitignored, never committed)
├── .gitignore
└── README.md
```

> **Note:** `backend/` and `frontend/` are intentionally kept **under**
> `server-version/` rather than promoted to the repository root. The first
> milestone was to establish a faithful, byte-for-byte baseline of the old
> system — not to refactor the directory layout. Directory promotion is a
> separate, later change.

## Reproducing the import (reference)

1. `git remote add source-eduk12 https://github.com/caohuibj/eduk12.git`
2. `git fetch source-eduk12 master`
3. `git checkout -b import/server-version`
4. `git checkout 2b9a11d97562b253bc3777565303d33e38de28a9 -- server-version`
5. commit → push branch → merge into `main` → tag

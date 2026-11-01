# Existing generation records and their limits

These are archived source records; no new generation run was performed.
Do not execute these snapshots as an application/runtime step.
Historical comments such as child/standard and internal-generated are preserved
verbatim; they are not the current pilot's age/rights claims.

## Fixed source content

- `generate-matrices.PR2.R` is the exact file at source commit
  `1676c67ac6d97601f611a3c0e9e00c3fcafd09e0`, original path
  `server-version/tools/matrix-generation/generate-matrices.R`, Git blob
  `c87fbe37d4ba97395d037d78998995edb404af4d`.
- `generate-matrices.R` is the exact later file at candidate source commit
  `16d9bbaa5fffb424ce463220d6f9f7d3a7280db5`, same original path, Git blob
  `3b42f1ef9fcc8a79cf55a68084598264ff8bc152`.
- Commit `dbab2f00abc8cf458141a93ddbe78ce985b5e17d` changes the default
  output location to the backend bank, removes one debug print and adds frontend
  copying. It does not change the matrix plan or figure expressions.

## Parameters recorded in source and bank

The script's default seed is `20261031`; the bank also records this seed. Its
CLI accepts `--seed` and `--out`; the actual historical shell invocation was not
retained. Cell drawing uses svglite at 1.15 × 1.15 inches and pointsize 6,
`standalone=FALSE`. Figure plans are fully present in the snapshots:

- 3×3: shape/shape, shape/identity, identity/shape; shade/shade and
  shade/identity on `size(malta(),3)`; rotate/rotate, rotate/identity and
  identity/rotate on `pacman()`; shade/rotate on `pacman()`; shape/rotate on
  `cof(square(),circle(),triangle())`.
- 2×2: the eight rotate/shade/size plans in the source. They are archived only,
  not included in the current 2.1.0 recommendation.
- Responses are produced by `response_list` with seed `seed+length(items)+1`;
  serialized duplicates are removed, correct remains first, at least seven
  responses are required. Current runtime selects six with a deterministic seed.

The old README prescribes R ≥4.x and installs `matRiks`, `svglite`, `jsonlite`
without pinning versions. The bank generator string records **matRiks 0.1.5**.
The exact **R, DescTools, svglite and jsonlite versions are UNKNOWN**. No
`sessionInfo()`, package lock/installed-version inventory or retained generation
stdout associated with this bank was found in the candidate's generation files.
The bank generator string is an existing declaration, not independently attested
execution evidence.

## Existing source-to-bank history

PR2 commit `1676c67ac6d97601f611a3c0e9e00c3fcafd09e0` contains the bank at
`server-version/tools/matrix-generation/bank-matgen.json`, blob
`453a7e6b6660e435423f70b385c19418fcb1518b`, with generatedAtUtc
`2026-10-31T04:52:09Z`. The later candidate contains the backend bank, blob
`449f11201500c132d8f68f17fd2151547d9221ec`, with generatedAtUtc
`2026-10-31T05:07:28Z`; frontend bytes match it. Parsed JSON differs between
these two versions only in generatedAtUtc: all 18 items and coverage match.
This supports the existing content lineage, but does not establish which exact
R/dependency environment ran or that either timestamp was independently logged.

The current seven-item subset reuses these existing SVG bytes. No new R run,
regenerated bank, replacement timestamp or reconstructed session log was made.
The source-specific independent review separately checked both fixed R scripts,
matRiks commit `eb5bd6159bfb006be5823f4959a75d21499a59f1` (DESCRIPTION,
MIT LICENSE, figure definitions and draw source), and the existing bank. Inputs
are mathematical geometry parameters, without external item images/banks. The
18 items' 264 SVG fragments contain polygon/rect and related drawing primitives,
with no image/text/use nodes or href/data references. No restricted external
standard-test item image input was found.

已检查固定生成脚本、生成器图形定义及现存SVG，未发现受限外部题图输入；本批图形按参数化程序生成材料处理，保留生成器署名与许可证。历史R/依赖版本及运行日志缺失，因此不承诺逐字节重建。

This source conclusion does not automatically classify every possible generated
output as MIT, and does not require extra per-SVG licenses, full old-environment
hash recovery or new author contacts. No generic rights HOLD or new gate is
created. The prior source's test/QC claims are not counted as a fresh
byte-for-byte rebuild. See ../THIRD_PARTY_NOTICES.md for license attribution;
psychometric validity, norms and age adaptation remain unverified.

# Cognitive content integration and structural audit

Base main: `642fda7ab754790686d6626efac62b73a332e663` (scale and cognitive onboarding mechanisms merged).
Existing PR360 source: `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`.
This branch preserves existing content and implementation history rather than
rebuilding candidates. It is an unqualified integration draft, not an activated
library or a deployment. Original PR360 remains unchanged.

## First repair batch

Six existing package descriptors listed report fields in tiers different from
their metric visibility. They failed the current generic publication structure
validator despite having custom candidate reports. Separate commits align only
those previously declared report fields:

- attentional-blink: validTrialCount → user.
- balloon-effort: validChoiceCount and highEffortChoiceCount → user.
- dual-arrow: validTrialCount → user; receivedTrialCount → detail.
- gradcpt: medianCorrectRT → user; presentedImageCount → detail.
- horizon-exploration: validFirstChoiceCount → headline; completedGameCount → user;
  receivedGameCount → detail. These three counters already appear in the custom
  public projection, and are quality/context fields, not ability scores.
- visual-search: accuracy → user; receivedTrialCount → detail.

No task stimulus, sequencing, counts, scoring formula, quality state, timing,
input behavior, report wording, reference or authorization was changed. Research
maps, arrays and reportBinding remain research_only. Existing protocol/config/
scorer identities and frozen report projection contracts remain unchanged; this
is correction of unpublished candidate descriptor consistency, not retroactive
recalculation or replacement of installed versions. No norms are invented.

Root ran only the new direct structural consumer check on these six changed
packages: six passed, zero failed. It checks generic validation, runtime compiler,
matching declared tiers, research-only maps/arrays, DRAFT state and absent norms.
Original JSON and log are in `evidence/report-visibility.*`. This does not execute
scorers, prove scientific validity, qualify browsers or establish database
installation. Original test histories stay in the source branch.

## Remaining work, not silently passed

- Review current source/scoring/parameter/report combinations and necessary raw
  score examples for each admitted package; use unchanged qualified evidence.
- Share existing native configuration factories with selected installation,
  without two registries or importing Prisma seed files across src rootDir.
- Verify installation preview/idempotence/frozen identity in an isolated database.
- Preserve public/anonymous/organization raw-archive authority boundaries. Native
  Training support is not automatically all four entry adapters or public usage.
- Real library registration, publication, entry assignment and deployment each
  need their actual execution evidence. Source presence is not installation.
- PR330 remains source/design material, not an executable candidate to recount.

Full integration CI has not run. The inherited PR365 exact CI binding is not a
valid binding for this new content branch; no Ready or activation is requested.
Only this batch's directly affected structural check has run on this candidate.

## 接续首批：共享 native 配置与隔离安装

逐包事实与范围见 [batch-queue.md](batch-queue.md)。原有 MOT 与点数判断配置
工厂移入 src 的既有 native-registry 区域，Prisma 保持重导出；selected installer
由同一精确来源解析，未复制配置或改动注册/生命周期/权限 guard。原配置哈希不变。

本节点新建隔离 PostgreSQL（无全量 seed）实际安装这两个 DRAFT/GRANT 配置，
两 profile 分别冻结而不增配置行；重复安装保留原行、仅两条审计；没有发布指针或
assignment。冲突保留、不覆盖。原失败夹具及仅失败用例续验均留存，详见
[evidence/native-install-receipt.json](evidence/native-install-receipt.json) 和
[evidence/native-postgres.json](evidence/native-postgres.json)。实际 CLI preview 读取
同一隔离库，MOT 为 ALREADY_PRESENT、被夹具故意改名且 RETIRED 的点数判断为
IMMUTABLE_CONFIG_CONFLICT，预期退出 2；不是一次新的失败安装或正式库结果。

源码可选安装、隔离库已安装、正式公共库发布、真实四入口可用是四件不同的事。
后两项未执行；原件 composite/access-token guard 未动，School/Teacher 适配仍待
root 协调。没有新增科研/版权审查门禁，也没有将现有候选重算为新开发。

# PR404 main 对齐及正式接纳准备

当前本批先合入 main `8cf07bfd35702222e279cbfeee2f64d73a938b55`，合并提交
`b4c1fcf3bb07d47b40026b43de43693fc4e7d224`。PR408 的 Training 增量没有混入。
只复用既有 onboarding-structure 证据接纳/CodeQL/稳定 merge gate，不新增 workflow 或 job。
原 group-report Draft 预检不能作为 Ready 资格；旧 41015176962 亦不证明新 merge 树通过。

原有 81 个 backend、2 个 frontend、2 个 HTTP/PG、1 个 SQL 事件对照、1 个宽 Form case
按保留原件和源变化审阅接纳，不重跑。前端/PG 的原部分失败及成功 continuation 均保留；
0-pass setup/超时记录仍保留在上级目录，不冒充成功报告。数据来源关联是执行后保存的
commit/WIP 审阅，未签名，不宣称原运行已与完整 Git tree 或 node_modules 密码学绑定。

本次缺失检查：

- 当前 backend/frontend 组件重新编译各一次，实际 argv、Node、开始/结束、组件 tree、
  before/after 与明确 exit0 见 types.json/exit。准备时两个 wrapper 同时调用 git write-tree，
  frontend 在 compiler 启动前遇 index.lock；改为顺序冻结 index、只读绑定后首次执行 compiler。
  没有删除锁、覆盖其他工作树或重跑已完成 backend 编译。
- 在两个全新自建 loopback `_test_` 库中，main 260 迁移实际成功，再仅应用
  `20261030160000_reporting_task_artifacts`。原生 PostgreSQL 16.15 custom dump/restore 完成，
  dump 只含 schema、迁移账本、一个合成用户及无答卷的合成加密 artifact；原件留 /tmp，不上传 dump。
- 首次 native case 因 runner --root 不会改变 cwd，找不到 Prisma CLI，在迁移候选前失败；
  修 helper 的明确 cwd 后续行，没有重建或重跑 main 迁移。
- 第二次已实际升级/完成 dump/restore，随后全 schema 文本相等断言失败。
  原生 restore 会格式化四条既有 CHECK 的 AND 括号，另有随机 restrict token；差异原件保留。
  它们不在本次 schema 改动内。检查范围收回新增 task artifact 表、索引/FK/trigger，
  不写泛化 SQL 归一化、不修改旧约束、也不重放已完成 dump/restore。
- 仅续验已恢复库的新表 schema 相等、原 artifact 解密与来源一致、immutable 触发器仍拒绝修改：
  **1 PASS**，见 native-continuation.json / native.json。
  receipt 明确 `nativeRestorePerformedThisInvocation=false` / `retainedNativeRestoreContinued=true`，
  不将续行报告冒称第二次重新恢复。

本次当前合并代码没有再构建应用镜像/整个平台或跑计分、所有权限矩阵、全浏览器套件。
旧 SQL 46/8 仍只是 N=2 合成 SQL 事件（含事务），不是生产性能或容量承诺。
新的两个 binding/gate 合同只在正式 CI 的既有 admission job 首次运行；不是业务测试重播。
实际 CI run/merge SHA/Ready 结果以 GitHub 后续回读为准；此目录本身不是 CI 成功。

## 首次正式激活的分类链错误

`b1290b33c601ed62b269c1bb7a0663efc73cc9b0` 的 Draft run 41022894812 / scope
123954126406 在 workflow 内嵌轻量分类器失败：它先调用旧 groupReportDraftPlan，
拒绝新的 onboarding-bindings.json。取消请求发出时 run 已结束；同一命令序列随后已把 PR
标为 Ready，所以 Ready run 41022969851 / scope 123954373030 再被旧 Draft-only 断言拒绝。
两个 run 和原日志均保留；admission、两个新控制合同、CodeQL、应用检查均尚未执行。
不是业务统计失败，也没有把原 run 重试或改写成功。

真正遗漏在 workflow inline 分类器，不在已调整的 content-scope CLI。修订只让同一个
现有 onboardingPlan 在 inline 也优先验证精确绑定，并补真实 head-repo 环境；通过该绑定
才走 dependency-free 分类，未知来源仍失败。新合同同时检查 inline/CLI 调用顺序和 Ready
三项结果要求。准备阶段将执行实际 inline 脚本和 CLI 在一个明确标注的本地合成 merge
checkout（同源树、真实base/source父提交）中产生的计划；不冒称 GitHub 真实检查通过。
当前失败尚未归因前没有继续重试或放大全量。修复及下一检查清单先写回既有 Notion，再激活。

## Main catalog alignment after user merge authorization

User approved PR404 merge; main subsequently moved to `8bd86e4059125b9ee868d4777795e513d36cba71` (PR403/410). Merge checkpoint `a63874d06020c95ab73dc5806f79ad3700597c30` contains 106 upstream-only files: 102 catalog files, one generated registry, three documents. Survey/reporting/frontend, locked dependencies and complete Prisma inputs are unchanged from qualified `7c7c4021af5cfe5646c428e43908a347c5531f72`.

Current backend component tree is `6209f9ffc617411a6b8d27b25596351fb3873910`; the new typed catalog registry changes that compiler input, so only backend types ran once, actual exit0. Frontend tree and its original compiler receipt are unchanged. Survey cases, database migration/native restore and browser journeys were not repeated.

The original native receipt remains byte-for-byte with its real base `8cf07bfd35702222e279cbfeee2f64d73a938b55`. Existing admission now permits a base change only after complete baseline Prisma trees and complete candidate Prisma trees match their original immutable commits. Its local negative control passed once, including changed baseline/candidate schema, missing proof and wrong provenance refusals. Original two binding/Ready fixtures already passed in formal run41024022582 and are not repeated; the existing scope/admission/SAST/Ready gate still process actual new candidate inputs. No new job, workflow or deployment gate is added.

The Azure artifact ZIP403 from the original formal run remains unresolved and is not retried. Official metadata/jobs were observed; ZIP bytes and SARIF content were not read. Current formal result remains pending until a new actual run succeeds.

School/Teacher work is isolated on `feat/group-report-school-teacher-20261030` checkpoint `d84ee65fa`, not present here. That checkpoint is explicitly in progress with frozen School privacy options still to integrate, and is not offered for merge.

Actual local native-base control output (tool exit0; local, not CI execution):

```text
✔ group-report qualification reuses native evidence only for identical baseline and candidate Prisma inputs (2.808416ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 109.022596
```

## Preserved main-race failure: run41032121655

Source f854b49c27127accf2dc0c57837926742da4fc0c, attempt1; scope123984083883 and Ready gate123984227036 failed. Admission/native/application/SAST NOTRUN. Official checkout79bb9df925d2f1ed901e3565edf6f9f5328d4c07 has parents b85e3466819266ffb8cd844b39d87aa566fb90e6 and f854; event base8bd was refreshed correctly, but PR411 merged at09:15:20 UTC before this09:15:36 run. Exact source tree5b077dc1 versus merge tree5e9bac58 mismatch correctly stopped classification. This is diagnosed moving-main, not an application failure.

Official raw logs: https://github.com/caohuibj/eduK12-new-version/actions/runs/41032121655/job/123984083883 . Downloaded full job log SHA256444e199abfe78bd0a9f06dcf92b80a28c80f96bc6f399946997cba04ce42423f (retained locally, not an artifact ZIP). First error excerpt:

```text
AssertionError [ERR_ASSERTION]: Source/merge tree drift
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2896901Z + actual - expected
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2897035Z 
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2897187Z + '5b077dc1e57c79f0d6e22f52b7d9f426663a9e53'
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2897549Z - '5e9bac58332dedc2d7591fc3474afb3c64e80dc7'
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2897755Z 
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2898182Z     at onboardingPlan (file:///home/runner/work/eduK12-new-version/eduK12-new-version/.github/scripts/onboarding-scope.mjs:68:25)
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2898859Z     at file:///home/runner/work/eduK12-new-version/eduK12-new-version/[eval1]:12:18
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2899413Z     at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2899821Z   generatedMessage: false,
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2900056Z   code: 'ERR_ASSERTION',
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2900342Z   actual: '5b077dc1e57c79f0d6e22f52b7d9f426663a9e53',
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2900718Z   expected: '5e9bac58332dedc2d7591fc3474afb3c64e80dc7',
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2901022Z   operator: 'strictEqual',
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2901235Z   diff: 'simple'
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2901425Z }
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2901526Z 
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2901613Z Node.js v24.21.0
classify changed content	select dependency-free documentation or tooling classification	2026-10-30T09:15:56.2914460Z ##[error]Process completed with exit code 1.
```

One bounded repair now aligns actual mainb85, only approved catalog/registry/docs changes. No old application, frontend type, browser or native replay. If main moves again, stop this qualification restart and ask DOT to sequence the merge window rather than churn candidates.

The b85-aligned backend registry input received one current compiler execution, exit0, component tree `3aec4bd4f19888eb9f02ea8cbd2f470a03de6365`. Frontend and baseline/candidate Prisma trees remain unchanged; no frontend/compiler, application, browser or database replay. This replaces the earlier catalog checkpoint receipt for current qualification; the old success remains in immutable e576 history.

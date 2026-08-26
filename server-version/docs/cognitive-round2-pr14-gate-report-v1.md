# eduK12 Cognitive Round 2 PR14 Gate Report v1

日期：2026-08-25
分支：`dev`
PR14 结论：**工程自动 Gate 已补齐；发布 Gate 当前 BLOCKED，未宣称通过**

## 1. 本次变更范围

- 新增 backend PR14 跨模块 release-gate 测试：覆盖 15 个 Round 2 任务的 Registry 精确键、strict schema、三档 Profile merge、冻结 randomization/report provenance、六个核心 ReportPackage 的固定槽位与版本、package/profile/slot mismatch、collection-only 字段边界、scale mapping hash/version/冻结正反方向以及 PR12/PR13 DRAFT 边界。
- 新增 frontend PR14 Registry Gate：覆盖 15 个 Runner 的精确 engine/scoring version、报告元数据完整性和未知版本拒绝；不允许 latest fallback。
- 新增 fixture-backed 真实 Chromium E2E harness：覆盖 collection-only、授权后 package 实例与固定槽位、质量失败保留有效 unit report、`k12_core_profile_v1` history/report/research export、跨来源 convergence/divergence、Snapshot 的显式 reanalysis 与完成快照稳定性；若 package fixture 仍为 draft，harness 会通过正常 HTTP 合约实例化并发布，绝不 seed/migrate/直查数据库。
- 新增隔离 Docker Compose override；它去除基线固定容器名并改用独立项目/卷和可配置 host port，避免把 Gate 运行到共享开发容器。
- 新增 Chrome pilot、刺激来源/许可/版本/内容审核、跨来源量表审核证据校验器。

未修改：

- `backend/prisma/schema.prisma` 和 `backend/prisma/migrations/`；本 PR14 没有新增表、字段或 migration。
- `frontend/src/modules/reporting/ScaleUnitReportCard.tsx`。
- 用户已有的 `frontend/eslint.config.js` 修改；该文件未被覆盖、暂存或提交。

## 2. 自动验证

已通过的本次新增定向测试：

- Backend：`pr14.release-gate.test.ts`，6 tests passed。
- Frontend：`Pr14ReleaseGate.test.ts`，2 tests passed。
- 新增 E2E 与 evidence validator：`node --check` 通过；release-gate shell：`bash -n` 通过。

PR13 handoff 提供的基线也已在本轮开始前重新确认。加入 PR14 Gate 后的最终全量结果为：backend 86 个测试文件通过、2 个 integration 文件按环境跳过，675 个测试通过、11 个跳过；frontend 41 个测试文件通过，164 个测试通过。backend build、Prisma validate、frontend typecheck、frontend build 和 `git diff --check` 均通过。

## 3. 发布 Gate 状态

以下项目在当前工作区没有被伪造为 PASS：

- Docker build、隔离 PostgreSQL migrate/seed、backend/frontend smoke：未在共享环境执行；需显式提供专用 Gate env 并设置 `COGNITIVE_R2_GATE_ISOLATED_DB=1`。
- 真实 PostgreSQL integration Gate：当前 `PR8_INTEGRATION_DATABASE_URL` 与 `COGNITIVE_INTEGRATION_DB_URL` 均未配置；release script 会在 Docker Gate 模式拒绝继续，避免把破坏性测试落到共享库。
- 六场景 Chrome E2E：harness 已完成，但当前未配置专用服务、无 `COGNITIVE_R2_E2E_FIXTURE_FILE`，因此未运行。
- Chrome standard battery pilot：当前没有真实 pilot evidence 文件，未通过总时长、键盘/触屏问题和中断恢复检查。
- 待发布刺激集来源、许可、版本、内容审核记录：当前没有 `APPROVED` evidence 文件。
- 跨来源 package 的实际量表审核记录：当前没有 `APPROVED` evidence 文件。

因此，PR14 的发布 Gate 仍为 BLOCKED；单元测试不会替代上述 E2E、实机 pilot 或内容/量表审核。

## 4. DRAFT / PUBLISHED 状态

- `attention_stability_v1`
- `inhibitory_control_v1`
- `working_memory_v1`
- `executive_control_v1`
- `learning_reasoning_v1`
- `k12_core_profile_v1`

以上六个 cognitive-only package 以及当前 multisource package 仍保持 `DRAFT`，`recommendedForCreate=false`，没有为了让 E2E 变绿而提前发布。

PR12/PR13 的 `trailmaking`、`reversallearning`、`bart`、`wordlist`、`lexicaldecision`、`emotionrecognition` 仍为 `DRAFT` 且 `recommendedForCreate=false`。没有原地改写历史版本。

## 5. 专用 Gate 运行入口

在隔离 PostgreSQL、隔离 Compose project、已批准 evidence 和 fixture manifest 准备好后，运行：

```text
COGNITIVE_R2_GATE_RUN_DOCKER=1 \
COGNITIVE_R2_GATE_ISOLATED_DB=1 \
COGNITIVE_R2_GATE_RUN_E2E=1 \
COGNITIVE_R2_GATE_MODE=promotion-candidate \
COGNITIVE_R2_GATE_CANDIDATE_PACKAGE=inhibitory_control_multisource_v1@1.0.0 \
COGNITIVE_R2_GATE_BASE_REF=25098332a354e9d169f62da6edf2d88f43066dbd \
COGNITIVE_GATE_ENV_FILE=/path/to/dedicated-gate.env \
COGNITIVE_R2_E2E_FIXTURE_FILE=/path/to/pr14-e2e-fixtures.json \
COGNITIVE_R2_GATE_EVIDENCE_FILE=/path/to/pr14-gate-evidence.json \
bash server-version/scripts/cognitive-round2-release-gate.sh
```

当前分支的 pre-release Gate 默认使用 `COGNITIVE_R2_GATE_MODE=pre-release`，并要求 manifest 列出的 PR14 package 全部保持 `DRAFT`。只有 promotion-candidate Gate 才允许 manifest 中精确指定的 `COGNITIVE_R2_GATE_CANDIDATE_PACKAGE` 变为 `PUBLISHED`；browser fixture 的 `package.key/version` 必须与该 candidate 完全一致，不能用任意未来 package 代替。`COGNITIVE_R2_GATE_BASE_REF` 必须解析到 manifest 固化的 review base commit；脚本拒绝 `COGNITIVE_R2_GATE_HEAD_REF`，始终检查当前仓库 `HEAD`，并要求 base 是 HEAD 的 ancestor。进入 tsc/test/build 前，工作树、index 和未跟踪文件也必须全部干净，确保实际测试的 filesystem snapshot 就是该 HEAD；随后仍检查已提交、暂存、未提交和未跟踪 diff。Gate Compose project 每次运行都会生成唯一后缀，并在退出时清理 project-scoped containers、volumes 和 orphan services。

同时必须在当前 shell 中提供 `PR8_INTEGRATION_DATABASE_URL` 和 `COGNITIVE_INTEGRATION_DB_URL`，且两者都指向专用、可清理的 PostgreSQL；脚本只检查是否存在，不打印其值。

fixture manifest 只应包含 assessment/attempt/package/slot 等非敏感验证数据；env 和 evidence 文件不得提交或输出密码、token、数据库 URL 或学生身份信息。

Evidence 文件必须符合 `server-version/e2e/cognitive-round2-gate-manifest.json` 的完整 stimulus、supporting artifact 和 multisource package 清单；pilot 必须明确为 `APPROVED`，设备问题为空，中断恢复为 `PASS`，并满足标准电池时长边界。

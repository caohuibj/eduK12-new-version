# Cognitive Round 1 — PR3 / PR4 代码评审

**评审对象：** `c2138b9`（`Merge branch 'feat/cognitive-round1-pr3-pr4'`）  
**对比基线：** `b942239`  
**评审日期：** 2026-08-23  
**仓库状态：** 本地 `dev` 相对 `origin/dev` ahead 57，未 push  
**结论：** PR2/PR2.5 复评第 14 节遗留的 3 个 P1、1 个 P2 已正确关闭；PR3/PR4 新增 4 个 P1、2 个 P2。暂不建议进入 PR5。

## 1. 评审范围

本次覆盖：

- PR2/PR2.5 复评遗留问题的关闭情况；
- PR3 research-long、ZIP、XLSX、Data Dictionary、冻结定义、权限和匿名语义；
- PR4 Go/No-Go 与 CPT-X 的三档 Profile、schema、正式试次、随机化、服务端评分、质量标记、单任务报告和前端 Practice；
- 当前测试是否覆盖真实产品链路和任务书验收边界。

本次不把“完整 Playwright start → history”单独列为代码缺陷。该项已明确安排在 PR7 发布 gate，但本评审列出的行为问题仍需通过新增定向测试关闭。

## 2. 已确认关闭的上一轮问题

| 条目 | 状态 | 复核结果 |
|---|---|---|
| 默认 K7-9 冒充个体年龄带 | 已关闭 | `lit-sim-k12-v0.2` 只接受 `participantAgeBand`。当前没有参与者年龄字段，因此实际报告 unavailable；已发布 1.1.0 JSON 未修改。 |
| Legacy 无冻结快照生成空报告 | 已关闭 | 无冻结快照时按 `testType + engineVersion + scoringVersion` 精确读取 Registry；对外 Profile 保持 null。 |
| Composite wrapper 复用条件不完整 | 已关闭 | 候选 wrapper 同时比对 Profile、`profileDefinitionVersion`、config hash 和解密后报告内容 hash；部分冻结来源直接返回 400。 |
| `perseverativeTrialCount` 无定义 | 已关闭 | 已加入 Memory 1.1.0 `MetricDefinition`，角色为 quality。 |

不需要新增 `configVersion=1.1.1`：当前实现没有修改 PUBLISHED 1.1.0，也已经阻止 seed/config 的 K7-9 被当作参与者年龄。  
不需要新增 `resolvedReportHash` 数据库列：对解密后的冻结报告做稳定内容 hash 可以满足当前 wrapper 复用身份判断。

---

## 3. P1 — Research ZIP/XLSX 生成后无法下载

### 位置

- `server-version/backend/src/modules/cognitive/cognitive.controller.ts:339-353`
- `server-version/backend/src/modules/cognitive/cognitive.schema.ts:94-104`
- `server-version/frontend/src/modules/cognitive/api.ts:68-69`
- `server-version/frontend/src/pages/teacher/CognitiveAssignmentEdit.tsx:104-125`

### 当前行为

PR3 可以在服务端生成：

```text
cognitive_<assignment>_research_<timestamp>_<uuid>.zip
cognitive_<assignment>_research_<timestamp>_<uuid>.xlsx
```

但下载接口的文件名白名单只接受：

```regex
(summary|full) ... (csv|sav)
```

因此，正确生成的 research ZIP/XLSX 在下载接口一定返回 404。

此外：

- 请求 schema 允许 `summary + xlsx`、`summary + zip`、`research + csv` 等没有明确合同的组合；
- `saveCognitiveExportFiles` 对所有非 CSV/SAV 格式都转入 research package，可能出现请求显示 `detail=summary`、实际文件却是 research 的语义错位；
- 前端 `cognitiveApi.exportData` 类型仍只接受 `summary|full + csv|sav`；
- 教师页面只有摘要 CSV、完整 CSV 两个入口，没有 research ZIP/XLSX 的产品路径。

### 影响

- PR3 的核心交付物无法从正常 API 链路交付给教师或管理员；
- 接口返回“导出成功”和 `fileName`，但下一步下载失败；
- 非法 detail/format 组合会产生与请求不一致的文件，而不是在入口处拒绝；
- 当前 export service 单元测试只构建内存表，没有覆盖“生成 → 下载”。

### 修复建议

1. 对请求增加交叉字段校验，明确允许组合：

   - `summary|full + csv|sav`；
   - `research + zip|xlsx`。

2. 下载白名单加入：

   - `research ... .zip`；
   - `research ... .xlsx`。

3. 更新前端 API 类型和教师导出入口，至少提供：

   - “科研长表 ZIP”；
   - “科研工作簿 XLSX”。

4. 下载按钮仍沿用当前二次 Assignment 权限校验和教师强制匿名规则。

### 必补测试

- `research + zip` 生成后可由同一 Assignment 下载；
- `research + xlsx` 生成后可下载；
- 跨 Assignment、跨教师下载仍返回 404/403；
- `summary + zip`、`research + csv` 等组合返回 400；
- 教师导出的 research package 中不出现姓名、username 或原始 userId。

---

## 4. P1 — 服务端评分没有验证 Session 随机序列

### 位置

- `server-version/backend/src/modules/cognitive/completion.service.ts:145-156`
- `server-version/backend/src/modules/cognitive/scoring/gonogo.v1.ts:22-31`
- `server-version/backend/src/modules/cognitive/scoring/cpt.v1.ts:32-46`
- `server-version/backend/src/modules/cognitive/schemas/gonogo.trial.ts`
- `server-version/backend/src/modules/cognitive/schemas/cpt.trial.ts`
- `server-version/frontend/src/modules/cognitive/tasks/shared/prng.ts`

### 当前行为

正式序列由前端根据 Session `randomSeed` 生成，但完成评分时：

```ts
entry.score({ config: validatedConfig, trials: scoringTrials })
```

没有把 `randomSeed` 或随机算法版本传给 scorer。服务端只能相信客户端写入的：

- Go/No-Go：`trialType`；
- CPT：`stimulus`、`isTarget`、`blockIndex`。

Go/No-Go 只校验全局 Go/No-Go 数量是否为 75%/25%，没有校验每个 `trialIndex` 是否与 seed 生成的正式序列一致。客户端可以根据自己是否按键重新标记 trialType，同时保持总数量不变。

CPT 甚至没有校验：

- target 数量是否等于 `round(totalTrials * targetRatio)`；
- `stimulus === 'X'` 是否与 `isTarget === true` 一致；
- 每个 `trialIndex` 的 stimulus/target 是否与 Session seed 一致。

例如 180 试次 CPT 可以只声明 3 个 target，并把这 3 个都标成命中；因为 `insufficientTargets` 的阈值是 `<3`，该数据仍可被判为 interpretable，并得到接近满分的结果。

### 影响

- “服务端评分”只保证公式在服务端执行，不能保证评分输入是服务端授权的正式协议；
- 学生可以通过直接调用 API 重分类试次，污染分数、metrics、quality 和科研导出；
- Session 保存了 randomSeed，但后端无法用它复现或审计实际正式序列；
- PR3 导出的 raw trial 看似可复现，实际不能证明 stimulus order 与冻结 seed 一致。

### 修复建议

建议把随机序列纳入版本化后端合同：

1. Scoring input 增加 `randomSeed`，或在 completion 前生成服务端 expected-trial context；
2. 后端实现与前端一致、具有版本号的 Go/No-Go/CPT 序列生成器；
3. 对每个 trialIndex 校验预期 trialType、stimulus、isTarget、blockIndex；
4. `correct` 继续由服务端根据预期刺激和 response 推导，不信任客户端；
5. Research Profile 冻结/导出 `randomizationAlgorithmVersion`、`blockDefinitionVersion`，为以后算法升级保留可回放身份。

最小修复不能只做 CPT 的数量校验。数量校验可以拦截明显异常，但仍无法阻止按响应结果交换 target/nontarget 位置。

### 必补测试

- 相同 seed 在前后端生成完全一致的 golden sequence；
- 改动任意一个 trial 的 `trialType`、`isTarget`、stimulus 或 blockIndex，completion 返回 400；
- CPT target 数与 config 不一致时拒绝评分；
- `stimulus='X'` 与 `isTarget=false` 时拒绝；
- 不同 seed 产生不同序列；历史算法版本仍可重放。

---

## 5. P1 — Go/No-Go 忽略冻结的 `isiMs`

### 位置

- `server-version/frontend/src/modules/cognitive/tasks/gonogo/GonogoTask.tsx:41-65`
- `server-version/backend/prisma/seed.ts:360-366`

### 当前行为

Go/No-Go Runner 固定：

```ts
show after 300ms
hide after 300ms + stimulusMs
```

虽然 config 和已发布 seed 都包含 `isiMs`，Runner 完全没有读取它。当前 seed 为：

```text
stimulusMs = 800
isiMs = 500
```

实际执行却使用 300ms 间隔。冻结配置、方法说明和实际呈现协议不一致。

### 影响

- timing 参数虽然被冻结和导出，却不能描述真实运行行为；
- RT、commission 和 d′ 来自不同于配置声明的 protocol；
- 后续同版本数据无法按配置精确复现；
- literature/reference 当前虽为 none，但未来也不能安全做 protocol match。

### 修复建议

- 用 `config.isiMs` 替换硬编码 300；
- 明确 `isiMs` 的含义是 stimulus onset 前等待、stimulus offset 后间隔，还是 inter-stimulus interval，并在 config/schema/README 中保持一致；
- timing 公式应由测试使用虚拟计时验证；
- 如果修复会改变已发布 `engineVersion=1.0.0` 的实际协议，应评估升级 engineVersion，而不是让同一版本在部署前后代表两个 timing 行为。

### 必补测试

- `isiMs=500` 时 stimulus 不在 499ms 前出现；
- stimulus 在 `isiMs + stimulusMs` 后隐藏；
- 修改 config 的 isiMs 会按比例改变计时；
- Practice 与 formal 使用相同的 timing 定义。

---

## 6. P1 — Practice 不能失败后重复

### 位置

- `server-version/frontend/src/modules/cognitive/tasks/gonogo/GonogoTask.tsx:45-53`
- `server-version/frontend/src/modules/cognitive/tasks/cpt/CptTask.tsx:45-53`
- `server-version/frontend/src/modules/cognitive/__tests__/GonogoCptTask.test.tsx`

### 当前行为

两个任务都固定执行 4 个 practice trial。每个 trial 结束后，无论：

- 是否应该按键；
- 是否按对；
- 是否遗漏；
- 是否误报；

都会把 `practiceLeft` 减一；到 0 后直接进入 formal。

Practice 没有：

- 正确/错误反馈；
- 通过条件；
- 失败后重新练习；
- 用户主动“再练一次”的入口。

当前测试只验证点击“开始练习”后尚未立即调用 `onTrialComplete`，没有使用虚拟计时跑完整 practice，也没有验证错误、重试和 formal 边界。

### 影响

这只关闭了“Practice 不写入正式 trial”这一半合同，没有满足 Round 1 的：

- Practice 必须允许失败后重复；
- 正式开始前清空 Practice state；
- P1 任务使用统一可验收 Practice DoD。

### 修复建议

建议为两任务抽取小型共享 Practice gate：

1. 保存 practice correct/error，但不写服务器正式 Trial；
2. 每题显示简短反馈；
3. 完成一组后按固定标准判断通过；
4. 未通过时提供“重新练习”，通过后才允许进入 formal；
5. 进入 formal 时清空 practice response、timer、interrupted 等状态。

通过标准应成为任务版本合同的一部分，不要散落为两个组件的魔法数字。

### 必补测试

- Practice trial 永不调用正式 `onTrialComplete`；
- 全错不能自动进入 formal；
- 失败后可以重新练习；
- 达到通过标准后才开始正式 trialIndex=0；
- Practice 中的 responded/interrupted 状态不会泄漏到正式第一题。

---

## 7. P2 — CPT 无命中 block 被当成 `0ms`

### 位置

- `server-version/backend/src/modules/cognitive/scoring/cpt.v1.ts:55-63`

### 当前行为

每个 block 的命中 RT 使用：

```ts
median(blockHitRts) ?? 0
```

如果某个 block 没有有效命中，缺失值会被写成 0，并参与 `blockSlopeRt` 回归。

0ms 是不可能的有效 RT，不是缺失值。它会制造不存在的跨 block RT 加速或减速趋势。

### 影响

- Research Profile 的跨 block RT slope 可能方向错误；
- 同一份数据在科研导出中会出现可计算的数值，而正确结果应为 null 或基于剩余有效 block 计算；
- 高遗漏恰好是 CPT 需要重点识别的质量问题，这类数据最容易触发错误斜率。

### 修复建议

- block RT 使用 `{ blockIndex, medianRt }` 点集；
- 无有效命中的 block 保持 missing，不写 0；
- 只对具有有效 RT 的 block 回归，并保留真实 blockIndex；
- 有效 block 少于两个时 `blockSlopeRt=null`；
- `blockSlopeOmission` 也应在 block 没有 target 时保持 missing，而不是用 0 冒充。

### 必补测试

- 中间 block 无命中时不引入 0ms；
- 只有一个有效 block 时 slope=null；
- 使用非连续 blockIndex 时斜率按真实位置计算；
- 全 block 有效的 golden fixture 公式保持稳定。

---

## 8. P2 — Summary 导出忽略 Registry 的导出/Profile 合同

### 位置

- `server-version/backend/src/modules/cognitive/export.service.ts:356-397`
- `server-version/backend/src/modules/cognitive/export.service.ts:433-465`
- `server-version/backend/src/modules/cognitive/registry-definitions.ts:424-425`

### 当前行为

summary/full 的字段构建和填值会遍历 scorer 返回的全部 `session.metrics`，没有检查冻结 `MetricDefinition` 中的：

```ts
export.summary
availableProfiles
```

CPT 的：

- `blockSlopeRt`；
- `blockSlopeOmission`

已标为 `role='research_only'`。`metric()` helper 会给它们默认 `export.summary=false`，但当前普通 summary 仍会输出这两个字段。

同时，它们没有覆盖 `availableProfiles`，因此仍被声明为 experience/standard/research 全部可用；共享报告的 secondaryMetrics 也无条件包含这两个字段。

### 影响

- Registry 声明和实际导出不一致；
- research-only 指标进入普通教师摘要宽表；
- Data Dictionary 虽然来自 Registry，但不能保证下游实际遵守 Registry 的可用范围；
- 以后新增更多 profile-specific 指标时会继续泄漏到不应出现的报告和导出入口。

### 修复建议

1. `detail=summary` 只导出 `definition.export.summary === true` 且包含当前冻结 Profile 的 metric；
2. `detail=research` 可以保留完整 metric 集合；
3. 明确 `detail=full` 是“summary 指标 + raw trials”还是“所有指标 + raw trials”，并按规格固定；
4. CPT 两个 slope 的 `availableProfiles` 改为 `['research']`；
5. 单任务报告 builder 也按 `availableProfiles` 过滤，或冻结 Profile 专属 reportDefinition，避免 experience/standard 报告显示 research-only 指标。

### 必补测试

- standard summary 不含 CPT block slopes；
- research-long 包含 block slopes；
- experience/standard 报告不显示 research-only 指标；
- scorer 返回未知 metric key 时，Data Dictionary gate 继续失败；
- 所有 summary 字段都满足冻结 Registry 的 `export.summary` 与 `availableProfiles`。

---

## 9. 推荐修复顺序

建议在进入 PR5 前依次处理：

1. 修复 research ZIP/XLSX 的请求组合和下载链路；
2. 建立服务端可复现的随机序列验证；
3. 修复 Go/No-Go timing，决定是否需要升级 engineVersion；
4. 补齐两任务可失败重试的 Practice gate；
5. 修复 CPT block slope 的 missing 处理；
6. 让 summary/report 遵守冻结 Registry 的 `export.summary` 与 `availableProfiles`。

随机序列验证和 timing 都会影响原始 Trial 的方法学身份。如果先继续 PR5，再统一修改 Runner/scorer 合同，会让更多任务重复迁移。

## 10. 修复合入 Gate

- 本文 4 个 P1 全部关闭；
- 2 个 P2 修复或有明确、不会污染 PR5 的延期决策；
- research ZIP/XLSX 生成和下载 E2E 通过；
- Go/No-Go/CPT 前后端 seed sequence golden fixture 通过；
- 两任务虚拟计时与 Practice retry 测试通过；
- scorer 返回的 metric/quality key 均在精确 Registry 中；
- summary/report/research-long 的 Profile 与 export 过滤测试通过；
- backend/frontend `tsc --noEmit` 通过；
- cognitive/composite 相关回归通过；
- PR7 继续保留完整 Playwright start → history 与 Docker smoke 发布 gate。

## 11. 本次独立验证

- Backend `tsc --noEmit`：通过。
- Frontend `tsc --noEmit`：通过。
- Backend 定向 Vitest：7 个文件、79 个测试通过。
- Frontend 定向 Vitest：3 个文件、9 个测试通过。
- Git HEAD：`c2138b9`。
- `dev` 相对 `origin/dev`：ahead 57。
- 没有 push。

现有测试通过说明已覆盖的 Registry、基础 scorer、复制冻结和内存 research table 路径是绿色的；本文问题集中在当前测试没有执行的生成后下载、客户端条件篡改、真实计时、Practice 完整状态机、缺失 block 和 Registry 过滤场景。

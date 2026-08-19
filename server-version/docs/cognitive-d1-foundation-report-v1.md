# Cognitive D1 基础验证报告 (Foundation Report v1)

**里程碑：** Milestone D — Cognitive Core · Session D-1（仅 D1 数据基础）
**仓库：** `caohuibj/eduK12-new-version`
**分支：** `feature/cognitive-core`（已推送，与 `dev` 分叉）
**D1 基线 SHA（D1 之前 HEAD）：** `2e0962a`
**D1.1 基线 SHA（D1.1 之前 HEAD）：** `7129c7e`
**报告日期：** 2026-08-19
**状态：** ✅ D1 + D1.1 均完成并推送（见第 14 节 D1.1 收口）

---

## 1. 范围与决策

- ✅ 本批次仅完成 **D1（数据基础）**：schema 迁移、严格加密助手、配置不可变助手、fake 配置 seed、特性开关、构建/Docker 门禁、留存校验、本报告。
- ⏸️ **D2 推迟**：Registry 插件契约、`fake` 配置/试次 Zod schema、`fake` scorer、Registry 测试（见第 11 节）。
- 🔖 收尾：`commit`（逻辑顺序） + `push feature/cognitive-core`（首次与 `dev` 分叉）。
- 🚫 本批次禁止（Session D-1 §36）：任何 Cognitive Assignment/Session/Trial/Completion API、Student/Teacher UI、Export endpoint、Reaction/Memory/Stroop。

设计依据：`Huisurvey_Milestone_D_v1.2_Revision_and_Closeout.md`（决策）、`Huisurvey_Milestone_D_Next_Development_Session_D1_v1.0.md`（任务书）。

---

## 2. Git / 远程状态

- D1 已推送：`feature/cognitive-core` 自 `2e0962a` 起追加 D1 共 6 个提交，`push` 后领先 `dev`(`bad600a7`) 9 个提交、behind 0，实现首次与 `dev` 分叉。
- D1.1（本批次）追加 4 个提交（schema+migration、seed 不可变、特性开关隔离、本报告），`push` 后 `feature/cognitive-core` 领先 `dev` 共 **13 个提交、behind 0**。
- 拓扑：
  ```
  main == dev == docker-baseline-v1 (bad600a7)
                     │
                     └── feature/cognitive-core  (+13, behind 0)
  ```
- Cognitive 仅存在于 `feature/cognitive-core`，未进入 `dev`/`main`（符合开发纪律）。
- 工作树未提交改动（D1.1，push 前）：
  - `M prisma/schema.prisma`（`participantSnapshotEncrypted` 替代 `participantSnapshot Json`；`configSnapshotEncrypted`/`randomSeed` 改为必填）
  - `?? prisma/migrations/20260819134700_cognitive_session_constraints/`
  - `M prisma/seed.ts`（`seedFakeCognitiveConfig` 改为不可变：findUnique→create / 一致 no-op / 不一致 FAIL）
  - `M src/config/index.ts`（pseudonym key 仅在 Cognitive ON 时强制；默认 false）
  - `M .env.example`（×2）、`M docker-compose.yml`
  - `M docs/cognitive-d1-foundation-report-v1.md`
- 注：`server-version/.env`（本地、gitignored）保持 `COGNITIVE_MODULE_ENABLED=true` + `DATA_PSEUDONYM_KEY`（供本地 Docker 门禁）；生产默认翻转见第 9 节。

---

## 3. 迁移（CREATE-ONLY → REVIEW → DEPLOY）

- **名称：** `20260819132001_add_cognitive_core_foundation`
- **生成方式：** 在 Docker ops 网络内用 `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` 生成（postgres 未发布 host 端口，仅容器内网可达；SQL 经 stdout 重定向落盘，避免容器内只读文件系统）。**未**使用 `migrate dev` 自动套用。
- **内容（纯增量，无破坏性 DROP）：** 3× `CREATE TYPE`（枚举）、4× `CREATE TABLE`、10× `CREATE INDEX`、7× `ADD CONSTRAINT`（FK 动作见第 5 节）。
- **套用：** `docker compose --profile ops run --rm migrate`（`prisma migrate deploy`）→ D1 时 `12 migrations found`（11 原业务 + 1 认知），全部 applied、无 pending。（注：v1 报告此处误写为 “11”，实为 12；见第 14 节。）
- **审查结论：** ✅ 仅新增对象；无对既有旧业务表/枚举的 `DROP` 或意外 `ALTER`。

---

## 4. Schema / 模型要点

4 个模型 + 3 个枚举（`CognitiveConfigStatus`、`CognitiveAssignmentStatus`、`CognitiveSessionStatus`）：
- `CognitiveTestConfig`：`testType`+`configVersion` 唯一（`@@unique`），`name` 必填，`config Json?`，`status` 默认 `DRAFT`。
- `CognitiveAssignment`：`courseId?` SetNull + `courseSnapshot` 抵御课程删除；`configId` Restrict；`createdBy?` SetNull；`status`。
- `CognitiveSession`：`userId?` SetNull；`participantKey`（HMAC 假名，非 userId）；`assignmentId`/`configId` Restrict；`attemptNo` + 唯一(`assignmentId, participantKey, attemptNo`)；`score`/`metrics`/`qualityFlags`/`configSnapshotEncrypted` 加密存储；`participantSnapshotEncrypted String?`（预留身份快照，D4 写入时加密，**禁止明文**）；`configSnapshotEncrypted` 与 `randomSeed` **必填**（可复现不变量，见 v1.2 P0-4）。
- `CognitiveTrial`：**仅 append-only**（无 `updatedAt`）；`sessionId` Cascade；`payloadEncrypted` + `payloadHash`（keyed HMAC）。

领域不变量：`attemptNo` + 配置版本化（每发布配置即新 `configVersion`，旧 `PUBLISHED`/`RETIRED` 不可改核心字段）。

---

## 5. 留存矩阵（7 行，已实证校验）

验证方式：查询 `information_schema.referential_constraints`（`postgres` 容器内 `psql`，**非破坏性**，优于对活库做删除行为测试；迁移 SQL 亦于第 3 节人工审查）。

| # | 子表 → 父表 | ON DELETE | 预期 | 实测 |
|---|---|---|---|---|
| 1 | `cognitive_sessions`.user_id → `users` | SET NULL | 删 User，Session 保留、userId 置空 | ✅ SET NULL |
| 2 | `cognitive_assignments`.created_by → `users` | SET NULL | 删教师，Assignment 保留、createdBy 置空 | ✅ SET NULL |
| 3 | `cognitive_assignments`.course_id → `courses` | SET NULL | 删课程，Assignment 保留、courseId 置空、快照保留 | ✅ SET NULL |
| 4 | `cognitive_assignments`.config_id → `cognitive_test_configs` | RESTRICT | 被引用配置不可物理删除 | ✅ RESTRICT |
| 5 | `cognitive_sessions`.config_id → `cognitive_test_configs` | RESTRICT | 被引用配置不可物理删除 | ✅ RESTRICT |
| 6 | `cognitive_sessions`.assignment_id → `cognitive_assignments` | RESTRICT | 含 Session 的 Assignment 仅可 ARCHIVED，不可物理删除 | ✅ RESTRICT |
| 7 | `cognitive_trials`.session_id → `cognitive_sessions` | CASCADE | 删 Session，Trial 级联删除 | ✅ CASCADE |

7 行全部与计划一致。**注意第 2 行（Creator→Assignment SetNull）与第 6 行（Assignment→Session Restrict）为 v1.2 修订新增，已落实。**

---

## 6. 密钥管理（3 种独立生命周期）

- **`DATA_ENCRYPTION_KEY`**（既有，64 hex）→ `encryptField` AES-256-GCM，加密 `payload/score/metrics/qualityFlags/configSnapshot`。
- **`DATA_PSEUDONYM_KEY`**（**新增**，64 hex，独立于加密密钥）→ `participantKey = HMAC-SHA256(userId, DATA_PSEUDONYM_KEY)`。分离目的：加密密钥轮换**不改变**参与者身份（跨时间关联稳定）。生产环境 `config/index.ts` 强制校验 64 hex。
- **派生完整性密钥**（**无新增 env**）→ `payloadHash = HMAC-SHA256(canonicalJson(payload), integrityKey)`，其中 `integrityKey = HMAC-SHA256('cognitive-trial-integrity-v1', DATA_ENCRYPTION_KEY)`（32 字节）。使用 keyed HMAC 而非明文 SHA-256，使库内读者无法对确定性明文做字典碰撞。

---

## 7. 加密行为（严格 + 统一信封）

文件：`src/modules/cognitive/cognitive.security.ts`
- **严格加密：** `encryptCognitivePayload(value)` → `encryptField({ version: 1, value })`。统一信封，使 `score`(number)/`metrics`(object)/`qualityFlags`(object)/`trial payload`(object) 共用同一加密契约。
- **严格解密：** `decryptCognitivePayload<T>(field)` → 使用 `utils/encryption.ts` 的严格 `decryptField`（**非** `safeDecrypt`）。写错的明文列会**读取失败** → 暴露安全回归而非静默成功。
- `getParticipantKey(userId)` → 稳定、不暴露 userId、64 hex HMAC。
- `hashTrialPayload(payload)` → keyed HMAC；`canonicalJson` 为稳定排序键、去空白序列化（顺序无关）。
- 测试：`src/__tests__/cognitive/security.test.ts`（10 例：信封往返、明文拒绝、participantKey 稳定/不暴露/64hex、keyed hash 稳定/顺序无关/变更、canonicalJson）。

---

## 8. 配置不可变助手

文件：`src/modules/cognitive/config-immutability.ts`
- `assertConfigCoreMutable(status)`：当 `status === PUBLISHED` 或 `RETIRED` 时抛错，禁止编辑核心字段。
- **推迟** `assertConfigStatusTransition(from,to)` 至 D2/manage API（合法转换 `PUBLISHED→RETIRED` 不被此函数阻止）。
- 测试：`src/__tests__/cognitive/config-immutability.test.ts`（3 例：DRAFT 允许、PUBLISHED/RETIRED 抛错）。

---

## 9. 特性开关 + 假名密钥接线

- `src/config/index.ts`：严格布尔解析 `parseBooleanEnv('COGNITIVE_MODULE_ENABLED', false)`（**Milestone D 完整验收前默认 false**，仅接受 `'true'`/`'false'`，非法值 → 配置错误；**未用** `z.coerce.boolean()`）。`DATA_PSEUDONYM_KEY` 64 hex 校验**仅在 `COGNITIVE_MODULE_ENABLED=true` 时**触发（模块隔离原则：关闭 Cognitive 时旧 eduK12 仍正常启动）。
- `.env.example`（×2：仓库根 + backend）补充 `COGNITIVE_MODULE_ENABLED=false` 与 `DATA_PSEUDONYM_KEY=`（注释说明：false 时旧系统独立运行；true 时生产必须配 pseudonym key）。
- `docker-compose.yml` `backend.environment`：`COGNITIVE_MODULE_ENABLED: ${COGNITIVE_MODULE_ENABLED:-false}` 与 `DATA_PSEUDONYM_KEY: ${DATA_PSEUDONYM_KEY}`（后者无默认值）。
- 隔离已实测：生产模式 `COGNITIVE_MODULE_ENABLED=false` 且无 `DATA_PSEUDONYM_KEY` → 配置加载成功；`=true` 且无 key → 抛错（见第 10 节）。
- 路由级网关在 D3+；本轮仅接线 + 校验值。

---

## 10. 测试 / 构建 / Docker 结果

- **构建（D1）：** `npm run build`（tsc）✅ 通过。注意 `prisma/seed.ts` 由 `tsx` 运行，不在 tsc 范围（D1 时 `name` 缺字段运行时错误因此未被构建捕获，已修）。
- **Cognitive 单测：** `npx vitest run src/__tests__/cognitive` → **13 passed (2 files)** ✅（D1 与 D1.1 均稳定通过）。
- **全量基线（`npm test`）：** 51 passed / **8 failed**（跨 5 个**既有、与 Cognitive 无关**文件）—— 见下方“已批准已知失败基线”。D1/D1.1 引入 **0 个新失败**。
  - **已批准已知失败基线（approved known-failure baseline，供 D1/D1.1 checkpoint）：**
    - `integration/checkinIntegration.test.ts`、`scoringService.test.ts`、`security/checkinSecurity.test.ts`、`services/checkinTokenService.test.ts`、`utils/cache.test.ts`（`cache.get` 返回 `undefined` 而非 `null`）。
    - 上述为预存失败，记为基线；最终 Milestone D → dev / main gate 要求全量 PASS，或引用本基线并自动证明“0 新增失败”。
- **Docker 门禁（D1.1 复核）：**
  - `docker compose build backend migrate seed` → 新镜像：`backend=3096c1cdc969`、`seed=4f78a91a0f7a`、`migrate=6f52ae54ab91`。
  - `migrate deploy` → 13 migrations found，应用 `20260819134700_cognitive_session_constraints`，无 pending ✅。
  - `seed`（重建后 ops 镜像）→ **幂等 no-op**：`Fake Cognitive 配置已存在且一致，跳过（幂等）`，未对任何 PUBLISHED 配置执行 UPDATE ✅（不可变已实证）。
  - `up -d backend frontend` → **4 服务 healthy** ✅。
  - 列校验（`cognitive_sessions`）：`participant_snapshot` 已删除；`participant_snapshot_encrypted text NULL` 已新增；`config_snapshot_encrypted`、`random_seed` 现为 `NOT NULL` ✅。
  - 特性开关隔离实测：生产 `COGNITIVE_MODULE_ENABLED=false` 且无 `DATA_PSEUDONYM_KEY` → 加载成功；`=true` 且无 key → 抛错 ✅。

> D1 关键修正：seed 服务使用 `ops` 目标镜像，首轮 `seed` 跑的是旧 ops 镜像（未含 `seedFakeCognitiveConfig`），重建 seed 镜像后解决。
> D1.1 关键修正：seed 不可变校验最初用 `JSON.stringify` 直接比 `config`，但 Postgres JSONB 不保序导致每次 re-seed 误判“内容不一致”而 FAIL；改为顺序无关 `deepEqual` 后幂等 no-op 成立。

---

## 11. 已知问题 / 后续入口

- **D2（下一会话）入口：** Registry 插件契约（`cognitive.types.ts`、`cognitive.registry.ts`、`cognitive.schema.ts`）、`fake` 配置/试次 Zod schema（`schemas/fake.config.ts`、`schemas/fake.trial.ts`）、`fake` scorer（`scoring/fake.v1.ts`）、Registry 测试、`assertConfigStatusTransition`。
- **D3+：** Assignment/分发、Session/Attempt、Append-only Trial API、Completion/Scoring、路由级 `COGNITIVE_MODULE_ENABLED` 网关；UI；Reaction/Memory/Stroop（明确不在本批次）。
- **预存测试失败**（checkin/scoring/cache）建议另立 issue 跟踪，不阻塞 Cognitive 推进。

---

## 12. 已修复 / 已落实的关键点（本批次）

1. 迁移生成走 create-only + 审查 + deploy，未用自动套用。
2. 严格加密：统一信封 + 严格 `decryptField`，不路由 `safeDecrypt`。
3. `participantKey` 用独立 `DATA_PSEUDONYM_KEY`（HMAC），`payloadHash` 用 keyed HMAC（派生完整性密钥）。
4. 留存矩阵补齐为 7 行（含 Creator→Assignment SetNull、Assignment→Session Restrict）。
5. `COGNITIVE_MODULE_ENABLED` 用严格 `parseBooleanEnv`；`DATA_PSEUDONYM_KEY` 64 hex 生产校验（**D1.1：仅 Cognitive ON 时强制**）。
6. seed 早期 `return` 重构为不短路整脚本；`seedFakeCognitiveConfig` 幂等写入（补 `name` 必填字段后通过；**D1.1：改为不可变，禁止 UPDATE PUBLISHED**）。
7. **（D1.1）特性开关隔离：** `COGNITIVE_MODULE_ENABLED` 默认 `false`（Milestone D 验收前）；pseudonym key 仅在 `true` 时强制。
8. **（D1.1）`participantSnapshot` → `participantSnapshotEncrypted String?`**：明文身份快照改为加密列（D4 写入加密）。
9. **（D1.1）`configSnapshotEncrypted` / `randomSeed` 改为必填**：落实可复现不变量，新增迁移 `20260819134700_cognitive_session_constraints`。
10. **（D1.1）seed 不可变校验用顺序无关 `deepEqual`**：修复 JSONB 不保序导致的误判。

---

## 13. DoD 核对（D1 子集）

- [x] D0 基线重校验 PASS（本地已提交）
- [x] 4 模型 + 3 枚举已迁移（审查过的增量 SQL）
- [x] 迁移经 create-only + 审查后 `migrate deploy` 套用
- [x] 留存 7 行矩阵实证校验（含 Creator→Assignment SetNull、Assignment→Session Restrict）
- [x] `attemptNo` + 配置版本化存在
- [x] `assertConfigCoreMutable` 存在且测试（PUBLISHED→RETIRED 允许）
- [x] 严格加密（无 safeDecrypt）；score/metrics/qualityFlags/payload 统一信封
- [x] `participantKey` 经独立 `DATA_PSEUDONYM_KEY`（HMAC）
- [x] `payloadHash` keyed HMAC（派生完整性密钥），非明文 SHA-256
- [x] fake 配置 seed 幂等
- [x] `COGNITIVE_MODULE_ENABLED` 严格布尔解析；`DATA_PSEUDONYM_KEY` 接入 config + 两 `.env.example` + compose
- [x] backend build PASS；Cognitive 13 测试 PASS（全量预存失败已记录，0 新增）
- [x] Docker migrate + seed PASS；4 服务 healthy
- [x] D1 验证报告已写
- [x] `feature/cognitive-core` 已 `commit` + `push`（D1：ahead 9 / behind 0）
- [x] **（D1.1）`seedFakeCognitiveConfig` 不可变：findUnique→create / 一致 no-op / 不一致 FAIL（禁止 UPDATE PUBLISHED）**
- [x] **（D1.1）特性开关隔离：OFF 不要求 pseudonym key；默认 false**
- [x] **（D1.1）`participantSnapshotEncrypted` 替代明文 `participantSnapshot`**
- [x] **（D1.1）`configSnapshotEncrypted` / `randomSeed` 必填 + 迁移应用**
- [x] **（D1.1）D1 报告状态/迁移计数/测试基线修正**
- [x] **（D1.1）`feature/cognitive-core` 追加 4 提交并已 `push`（共 ahead 13 / behind 0）**

---

## 14. D1.1 收口修正（新增，基于架构评审）

评审结论：D1 主体架构符合设计（约 85–90%），但存在 2 个 P0 架构一致性矛盾 + 2 个模型约束问题，需在进入 D2 前收口。本批次（`7129c7e` → D1.1 提交）已完成：

### 14.1 P0-1：Fake seed 破坏“Published Config Immutable”
- **问题：** 原 `seedFakeCognitiveConfig` 用 `upsert(update)`，会在重新 seed 时静默覆盖同一 `configVersion=1.0.0` 的 PUBLISHED 配置，违反不可变原则（与 `assertConfigCoreMutable` 助手矛盾）。
- **修复：** 改为 `findUnique` → 不存在 `create` / 存在且内容一致 `no-op` / 存在但内容不同 `FAIL`（提示创建 `1.0.1`/`1.1.0`）。**绝不 UPDATE PUBLISHED 配置。**
- **实证：** re-seed 输出 `Fake Cognitive 配置已存在且一致，跳过（幂等）`，未执行任何 UPDATE。

### 14.2 P0-2：特性开关未真正隔离（关闭 Cognitive 旧系统应不受影响）
- **问题：** `config/index.ts` 在 production 下无条件要求 `DATA_PSEUDONYM_KEY`，导致 `COGNITIVE_MODULE_ENABLED=false` 却缺 key 时 backend 启动失败，违反模块隔离。
- **修复：** `DATA_PSEUDONYM_KEY` 64 hex 校验**仅在 `cognitiveModuleEnabled===true` 时**触发；默认 `false`（Milestone D 完整验收前）。
- **实证：** 生产模式 `false`+无 key → 加载成功；`true`+无 key → 抛错。

### 14.3 P0（D4 前）：participantSnapshot 明文身份风险
- **问题：** `participantSnapshot Json?` 为明文身份快照（可能含 nickname/class/demographic），与其余加密字段不一致。
- **修复（方案 A）：** 改为 `participantSnapshotEncrypted String?`，D4 Session API 写入时须用 Cognitive strict encryption 加密；禁止明文。
- 注：`CognitiveAssignment.courseSnapshot` 仍为明文业务快照（非身份数据），不在本次范围。

### 14.4 模型约束：configSnapshotEncrypted / randomSeed 必填
- **问题：** 二者为 `String?`，但可复现不变量要求任何正式 Session 必须有 `configSnapshot`/`randomSeed`。
- **修复：** 改为 `String`（NOT NULL）+ 迁移 `20260819134700_cognitive_session_constraints`（纯 `ALTER TABLE`：DROP `participant_snapshot`、ADD `participant_snapshot_encrypted`、两列 `SET NOT NULL`；无破坏性 DROP）。当前无 Session 行，套用安全。

### 14.5 报告修正
- Git 拓扑 / 状态：feature/cognitive-core 已 push，ahead 13 / behind 0（D1=9 + D1.1=4）。
- 迁移计数：D1 实际 12（v1 误写 11），D1.1 后共 13，全部 applied、无 pending。
- 测试基线：明确“已批准已知失败基线（5 文件 / 8 失败，0 新增）”，供最终 gate 引用。

### 14.6 推迟 / 不阻塞
- Redis `getBullRedisOptions()` 回退 `localhost:6379`：D0 已记为 Known Issue（P2），Docker 显式注入 `REDIS_URL` 不触发，不阻塞 Cognitive。
- D2 Registry 未开始，符合计划。

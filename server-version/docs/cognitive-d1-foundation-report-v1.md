# Cognitive D1 基础验证报告 (Foundation Report v1)

**里程碑：** Milestone D — Cognitive Core · Session D-1（仅 D1 数据基础）
**仓库：** `caohuibj/eduK12-new-version`
**分支：** `feature/cognitive-core`
**基线 SHA（本批次之前 HEAD）：** `2e0962a`
**报告日期：** 2026-08-19
**状态：** ✅ D1 完成并落地；待 `commit` + `push`（见第 9、10 节）

---

## 1. 范围与决策

- ✅ 本批次仅完成 **D1（数据基础）**：schema 迁移、严格加密助手、配置不可变助手、fake 配置 seed、特性开关、构建/Docker 门禁、留存校验、本报告。
- ⏸️ **D2 推迟**：Registry 插件契约、`fake` 配置/试次 Zod schema、`fake` scorer、Registry 测试（见第 11 节）。
- 🔖 收尾：`commit`（逻辑顺序） + `push feature/cognitive-core`（首次与 `dev` 分叉）。
- 🚫 本批次禁止（Session D-1 §36）：任何 Cognitive Assignment/Session/Trial/Completion API、Student/Teacher UI、Export endpoint、Reaction/Memory/Stroop。

设计依据：`Huisurvey_Milestone_D_v1.2_Revision_and_Closeout.md`（决策）、`Huisurvey_Milestone_D_Next_Development_Session_D1_v1.0.md`（任务书）。

---

## 2. Git / 远程状态

- 本地 HEAD `2e0962a`，本地领先远程 `origin/feature/cognitive-core` 3 个提交（D0 重校验报告、redis 生产兜底修复、seed 管理员凭据修复 —— 均仅本地）。
- 远程 `feature/cognitive-core` 仍等于 `dev`（`bad600a7`，`ahead_by=0`）。本批次 `push` 后远程首次与 `dev` 分叉。
- 工作树未提交改动（本批次）：
  - `M server-version/backend/prisma/schema.prisma`（+4 模型 +3 枚举）
  - `?? prisma/migrations/20260819132001_add_cognitive_core_foundation/`
  - `?? src/modules/cognitive/`（security + immutability）
  - `?? src/__tests__/cognitive/`（13 测试）
  - `M prisma/seed.ts`、`M src/config/index.ts`、`M .env.example`（×2）、`M docker-compose.yml`
- 注：`server-version/.env`（本地、gitignored）已补充 `DATA_PSEUDONYM_KEY`（新生成 64 hex）与 `COGNITIVE_MODULE_ENABLED=true`，仅用于本地 Docker 门禁，不入库。

---

## 3. 迁移（CREATE-ONLY → REVIEW → DEPLOY）

- **名称：** `20260819132001_add_cognitive_core_foundation`
- **生成方式：** 在 Docker ops 网络内用 `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` 生成（postgres 未发布 host 端口，仅容器内网可达；SQL 经 stdout 重定向落盘，避免容器内只读文件系统）。**未**使用 `migrate dev` 自动套用。
- **内容（纯增量，无破坏性 DROP）：** 3× `CREATE TYPE`（枚举）、4× `CREATE TABLE`、10× `CREATE INDEX`、7× `ADD CONSTRAINT`（FK 动作见第 5 节）。
- **套用：** `docker compose --profile ops run --rm migrate`（`prisma migrate deploy`）→ 结果 `11 migrations found ... No pending migrations to apply.`（认知迁移已应用）。
- **审查结论：** ✅ 仅新增对象；无对既有旧业务表/枚举的 `DROP` 或意外 `ALTER`。

---

## 4. Schema / 模型要点

4 个模型 + 3 个枚举（`CognitiveConfigStatus`、`CognitiveAssignmentStatus`、`CognitiveSessionStatus`）：
- `CognitiveTestConfig`：`testType`+`configVersion` 唯一（`@@unique`），`name` 必填，`config Json?`，`status` 默认 `DRAFT`。
- `CognitiveAssignment`：`courseId?` SetNull + `courseSnapshot` 抵御课程删除；`configId` Restrict；`createdBy?` SetNull；`status`。
- `CognitiveSession`：`userId?` SetNull；`participantKey`（HMAC 假名，非 userId）；`assignmentId`/`configId` Restrict；`attemptNo` + 唯一(`assignmentId, participantKey, attemptNo`)；`score`/`metrics`/`qualityFlags`/`configSnapshot` 加密存储。
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

- `src/config/index.ts`：新增严格布尔解析 `parseBooleanEnv('COGNITIVE_MODULE_ENABLED', true)`（仅接受 `'true'`/`'false'`，非法值 → 配置错误；**未用** `z.coerce.boolean()`，因 `Boolean('false')===true`）。`DATA_PSEUDONYM_KEY` 加 64 hex 生产校验。
- `.env.example`（×2：仓库根 + backend）补充 `COGNITIVE_MODULE_ENABLED=true` 与 `DATA_PSEUDONYM_KEY=`（注释说明生成方式与用途）。
- `docker-compose.yml` `backend.environment` 补充 `COGNITIVE_MODULE_ENABLED: ${COGNITIVE_MODULE_ENABLED:-true}` 与 `DATA_PSEUDONYM_KEY: ${DATA_PSEUDONYM_KEY}`（后者无默认值，生产必须于 `.env` 提供）。
- 路由级网关在 D3+；本轮仅接线 + 校验值。

---

## 10. 测试 / 构建 / Docker 结果

- **构建：** `npm run build`（tsc）✅ 通过（config/index.ts、重构后的 seed.ts 均编译通过）。
  - 注意：`prisma/seed.ts` 由 `tsx` 运行，**不在 tsc 构建范围内**，故 `CognitiveTestConfig` 缺 `name` 字段的运行时错误未被构建捕获（见第 12 节“已修复问题”）。
- **Cognitive 单测：** `npx vitest run src/__tests__/cognitive` → **13 passed (2 files)** ✅。
- **全量基线（`npm test`）：** 51 passed / **8 failed**（跨 5 个**既有、与 Cognitive 无关**文件）：
  - `integration/checkinIntegration.test.ts`、`scoringService.test.ts`、`security/checkinSecurity.test.ts`、`services/checkinTokenService.test.ts`、`utils/cache.test.ts`（cache.get 返回 `undefined` 而非 `null`）。
  - 本轮引入 **0 个新失败**。上述为预存失败，记录基线，不在本批次范围。
- **Docker 门禁：**
  - `docker compose build backend`（runtime 目标）→ 新镜像 `32282d5fb6ee`。
  - `migrate deploy` → 无待应用迁移。
  - `seed`（ops 目标，需重建以纳入新 seed.ts）→ fake 配置已幂等 upsert：`fake / 1.0.0 / Fake Cognitive Test v1.0.0 / PUBLISHED` ✅。
  - `up -d backend frontend` → **4 服务 healthy**（postgres / redis / backend / frontend）✅。
  - 表存在性：`cognitive_test_configs` / `cognitive_assignments` / `cognitive_sessions` / `cognitive_trials` 均存在 ✅。

> 关键修正：seed 服务使用 `ops` 目标镜像，首轮 `seed` 跑的是**旧 ops 镜像**（未含 `seedFakeCognitiveConfig`），导致 fake 行缺失；重建 `seed` 镜像后解决。

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
5. `COGNITIVE_MODULE_ENABLED` 用严格 `parseBooleanEnv`；`DATA_PSEUDONYM_KEY` 64 hex 生产校验。
6. seed 早期 `return` 重构为不短路整脚本；`seedFakeCognitiveConfig` 幂等 upsert（补 `name` 必填字段后通过）。

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
- [ ] `feature/cognitive-core` 待 `commit` + `push`（本批次收尾步骤）

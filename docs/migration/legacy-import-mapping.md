# 旧系统（ptool）数据导入映射与设计

> 状态：设计文档（feat/legacy-import 分支）。实现前需确认 §10 的待确认项。
> 源基线：ptool @ 2b9a11d9；快照 20260930T100128Z（最终停写快照将在切换日重新导出并复核）。
> 目标基线：main @ 69235a74（本分支基于此）。

## 1. 架构与原则

- 导入器 = 新仓库内一次性/可重跑脚本（`backend/src/scripts/migration/`），读**旧模型恢复库**（只读账号），写**新库**（业务账号）。
- 旧模型恢复库：切换日将最终 pg_dump 恢复为同实例独立数据库 `ptool_legacy`（旧 schema 在 PG16 上可直接恢复，已在验收环境验证：31 张表全部恢复）。
- 原则（来自迁移交接要求）：
  1. 账号密码哈希（bcrypt）原样保留，可登录；
  2. 课程、成员、作业、提交、提交历史、打卡、媒体、软删除语义尽量完整保留；
  3. 旧量表测评**不进新运行时表**（不伪装 ScaleResultV2、不重算分），进入**旧模型一致的独立归档库**，由只读查询模块按需展示；
  4. 不从 user_id 猜测补造组织/家长/同意/测评主体关系；管理员 platformRole 显式核对（§10-1）；
  5. 旧访问令牌用新系统既有转换函数（`checkinTokenCrypto` / public token backfill 同源）转成 hash+encrypted；
  6. 全程 dry-run 先行、分批 apply、批次与 ID 映射落库、逐表对账、可重跑幂等。

## 2. 旧库实测清单（9/30 快照，与交接基线完全一致）

users 83（73S/8T/2A）、courses 7、course_students 71、assignments 9、submissions 84、
submission_histories 13、checkins 59、checkin_submissions 103、checkin_access_tokens 2、
scales 6、scale_items 18、dimensions 8、assessments 128、questionnaires 4、
questionnaire_form_items 18、questionnaire_assessments 21、questionnaire_form_answers 108、
course_questionnaires 2、videos 88、documents 28、classrooms 1（+1 问题、0 会话）、
teacher_codes 5、course_scales 0、course_shares 0、questionnaire_access_tokens 0。
加密列：assessments.answers / assessments.scores / assessments.feedback（旧 DATA_ENCRYPTION_KEY）。

## 3. 表分类与逐表映射（27 共名 + 3 旧独有）

### 3.1 直接复制（字段全同，逐行 INSERT，保留主键/时间戳）
Assignment、Checkin、Classroom、ClassroomAnswer、ClassroomQuestion、ClassroomSession、
CourseQuestionnaire、CourseScale、CourseShare、CourseStudent、QuestionnaireScale、
SubmissionHistory、TeacherCode（历史码仅保留为记录，默认置过期）。

### 3.2 需转换的表
| 表 | 转换 |
|---|---|
| User | 共有字段直拷；新增：`platformRole=STANDARD`（默认），`teacherApproved=true`（全部旧教师已启用），`mustChangePassword=false`，`tokenVersion=0`；`isActive` 语义不变；密码哈希原样。2 名 ADMIN 的 platformRole 见 §10-1 |
| Scale | 旧 `config:Json + ScaleItem[] + Dimension[]` → 新 `definition:Json(schemaVersion 2)`（items/responseSets/scoring.scores/report），`instrumentClass='CUSTOM_DESCRIPTIVE'`，definitionHash 用 `hashScaleDefinition`；保存后走既有 validate 端点逻辑校验。旧 items/dimensions 结构进 definition，不再有独立表 |
| Questionnaire | 共有字段直拷；新 `formSections` 由 `ensureQuestionnaireFormSections` 按旧 form item 顺序物化（旧无 section 概念 → 单默认 section 映射，`status` 语义映射见 §3.4） |
| QuestionnaireFormItem | 直拷 + `sectionId/sectionPosition`（由 §3.4 的 section 物化回填），`contextKey` 可空 |
| Video / Document | 共有字段直拷；`assetId/…AssetId` 经资产迁移（ASSET-MIGRATION.md 流程）注册 StoredAsset/AssetReference 后回填；**6 条失效本地视频 URL 按 missing-file-references.json 的替代文件映射改写**；软删除字段原样 |
| CheckinAccessToken | `token`(明文) → `tokenHash=hashToken(token)` + `tokenEncrypted=encryptToken(token)`，`token` 置 NULL（满足 `checkin_access_tokens_token_must_be_null` 约束；新 tokenHash/Encrypted 列）|
| QuestionnaireAccessToken | 同上（复用 public token backfill 同源函数）；旧库为 0 行，实现保持以备最终快照非零 |
| Submission / CheckinSubmission | 直拷 + `revision=1`（旧无版本概念，初次导入视为第一版）；幂等列留空 |

### 3.3 归档（不进新运行时表）
- 旧 `Assessment`（128 条量表测评，含加密 answers/scores/feedback）、`QuestionnaireAssessment`（21 条）、
  `QuestionnaireFormAnswer`（108 条，`value` 若为密文则同样保留密文）：**整体留在 ptool_legacy 归档库**，
  原样可追溯；由 §5 只读模块展示。
- 旧 `Dimension / ScaleItem / ItemDimension`：随 Scale.definition 转换保留其内容（definition JSON 内），
  归档库同时保留原始行。
- 理由：新 Assessment/QuestionnaireAssessment 是 FINAL_ONLY v2 运行时（attemptEpoch/runtimeGeneration/
  result 等），旧数据塞入需伪造运行时字段，违反"不伪装 ScaleResultV2"。
- 加密处理：归档密文保留旧钥加密（不重加密、不存明文副本）；只读适配器**仅在展示时**用
  `LEGACY_DATA_ENCRYPTION_KEY` 受限解密限定字段（answers/scores/feedback），不落盘、不入日志。

### 3.4 状态语义映射（旧 → 新）
- QuestionnaireFormItem/QuestionnaireAssessment 留在归档库原样，因此 status 映射仅在只读展示层标注
  （旧 status 原样展示 + "历史归档"标签）。新表不引入旧测评行。
- Questionnaire（内容表）`status`：DRAFT→DRAFT、PUBLISHED→PUBLISHED、其他旧值→原样保留并在导入报告列出。

### 3.5 不导入 / 无数据
- 新系统 55 张新表（Cognitive/Composite/SJT/Bundle/Organization/Parent/SafetyCase/…）与旧系统无对应，不迁移、不构造。
- 旧 `questionnaire_access_tokens=0`、`course_scales=0`、`course_shares=0`：结构支持但无数据。

## 4. 访问令牌与资产
- 令牌转换复用 `src/services/checkinTokenCrypto.ts` 的 `hashToken/encryptToken`（新钥），确保与
  `db:backfill:public-tokens` 同源兼容；导入后运行 release-preflight 验证四类 token 约束（unvalidated=0）。
- 资产：uploads.tar（20 文件，417MB）与 COS 对象经 ASSET-MIGRATION.md 流程注册 StoredAsset/AssetReference，
  内容 SHA-256 逐一计算（不以 ETag 替代）；6 条失效本地视频 URL 按
  `missing-file-references.json` 的替代映射改写指向现存替代文件；8 条无主文件的软删除视频与
  1 条仍被引用的软删除视频进问题清单（不静默丢弃）；`backups/` 前缀 COS 对象排除。

## 5. 历史只读查询模块（本 PR 的第二部分）
- 后端：`/api/admin/legacy-archive/*`（authenticate + requireAdmin + platformRole 校验）：
  - `GET /overview`：归档统计（各表计数、时间范围）；
  - `GET /assessments?studentId=&scaleId=&status=&page=`：旧量表测评列表（原样字段 + 解密后的
    answers/scores/feedback 摘要，标注"历史归档（旧系统原样，未重算）"）；
  - `GET /assessments/:id`：单条详情（含原分数、反馈、来源，密文字段服务端解密后返回，不缓存）；
  - `GET /questionnaire-assessments…`：同构；
  - 全部只读：连接使用 `DATABASE_URL_LEGACY`（只读 Postgres 角色，仅 SELECT 权限），代码层无任何写操作。
- 前端：管理端新增"历史归档（旧系统·只读）"页面（列表 + 详情 + 归档标识横幅），不做任何编辑入口。
- 归档库生命周期：与业务库同实例独立 DB；删除/退役仅允许显式运维动作，不随业务清理。

## 6. 导入器设计（backend/src/scripts/migration/）
- `lib/legacy-client.ts`：旧库只读客户端（`DATABASE_URL_LEGACY`，Prisma 旧 schema client 或 pg 原生查询，
  以 pg 原生为主避免两套 Prisma client 冲突）。
- `lib/id-map.ts` + 迁移表（新 Prisma migration 增加两张表，随 guarded migrate 部署）：
  - `_legacy_import_id_map`（entity, legacy_id, new_id, batch_id, created_at，唯一(entity,legacy_id)）；
  - `_legacy_import_batches`（batch_id, mode(dry_run/apply), started/finished, per-table counts,
    checksum(sha256 of row-id manifest), status, error）。
- 顺序（可整体重跑）：users → courses → course_students → assignments → submissions →
  submission_histories → checkins → checkin_submissions → checkin_access_tokens →
  questionnaires/form items → course_questionnaires → videos/documents（资产关联后）→
  classrooms/teacher_codes → 对账。
- 幂等：每行按 `_legacy_import_id_map` upsert；重跑只补缺失/不一致行。
- 批次：默认每表一个批次可配 `--batch-size`；每批事务内写 id_map + 批次记录。
- 对账（`verify` 子命令）：逐表计数对比（old、new、expected 差异列）、抽样内容哈希比对
  （assignment/checkin/submission 内容字段）、外键完整性（无孤儿）、令牌验证（hash 可匹配原文）。
- dry-run：完整执行映射与校验，但所有写操作替换为报告（含将插入行数、冲突、platformRole 映射表）。

## 7. 环境变量（服务器受限保存）
- `DATABASE_URL_LEGACY`：旧恢复库连接串（只读角色）；
- `LEGACY_DATA_ENCRYPTION_KEY`：旧加密钥（仅归档适配器展示用，受限保存）；
- 业务钥沿用新库 `.env`。

## 8. 测试
- 单测：scale definition 转换（旧 config/items/dimensions → V2）、token 转换、状态语义、URL 改写映射；
- 集成：以小型合成 legacy fixture（建临时 legacy schema）跑 dry-run+apply+重跑+对账；
- 演练：验收环境对 9/30 快照（ptool_legacy）完整 dry-run + apply + 对账，报告留 evidence。

## 9. 验收环境演练状态
- ptool_legacy 已在验收库恢复（31 表，计数与基线一致）；
- 导入器实现后先在验收环境 dry-run，再 apply 演练，最终切换日对最终快照重跑。

## 10. 待确认项（阻塞 apply，不阻塞开发）
1. **管理员 platformRole 映射**：旧 2 名管理员 `admin`（初始管理员，2026-02-08）与 `caohui`（曹慧，
   2026-02-21）在新系统的 `platformRole`（SYSTEM_ADMIN / STANDARD）各是什么？默认建议：两者均为
   SYSTEM_ADMIN（与旧系统平台管理员语义一致），需你确认或指定。
2. 旧教师全部 `teacherApproved=true`（8 名均已在职使用）是否符合预期？
3. 历史只读模块是否需要在前端管理界面加入口（本设计含最小页面），还是仅 API 即可？

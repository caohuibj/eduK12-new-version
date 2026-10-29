# 首批 SELF 普通问卷：冻结收尾及 CI 计划

本批来源固定为 `9fa3c51e5deb882beb4a0d56f1ebe44dae8f76f5`，main 基线经只读确认仍为 `9801107019d51a4af7ddb651789b674867539d24`。独立发布分支 `release/education-self-scale-form-20261028`。R3 修复为 `d112757b3`；此文不是最终 CI source/head/tree 冻结记录。

交付边界是 School 学生 SELF、Teacher 教师 SELF 的私有与获授权 Scale/Form 普通问卷：选择与编制、说明、冻结、分配、作答、恢复、保存和获准反馈。后续他评、认知/SJT、复杂整包引用另批。当前 Form 适配器对跨页条件和全局素材明确拒绝；保持原版内容，不能把这类来源算作本批已支持。B 已合入的现有管理页缺陷修复随共用消费者保留。

## 当前证据

- R1/R2 修复及增强回归已在 ff528cafa；9fa 又扩展了展示白名单的 SQL 投影。需核对最终原件及消费输入，再决定哪些证据仍有效。本线未重复诊断或重跑它们。
- B 两项修复及 privacy fixture 已在固定父链；8756addf5 与 c55d6d721 的八控制 patch-id 完全相同。本轮无 CI 控制输入变化，八项控制及已有 UI 本地结果不重跑。
- R3：原 53193a894 的真实 FAIL 保留；799066638 只转入其独立测试。新 forward migration 保留原结构整数编码，只有两个完整科学定义摘要调用改用专用编码；没有修改既有迁移或科学分值。
- 本线定向结果：原批准小数来源冻结、JS/PG 编码边界、结构整数约束共 3 PASS；既有库伪造描述符案例 1 PASS（其余 2 个未选中）；受同一新摘要调用点影响的 Standard School 案例 1 PASS。两份新测试的消费类型 PASS。独立 review 的跨预览叶迟到响应、跨入口/账号迟到预览两例未在固定候选中集成；本线只补入这两例，当前消费者下 2 PASS，新增文件消费类型 PASS。未进行前后端构建、浏览器或正式 CI。
- 新迁移最初使用保留字 leading 的本地语法失败已保留，改为 leading_count 后只续应用该未提交迁移。Standard 首次因缺合成校园 HMAC key 在夹具阶段失败；补明确隔离测试环境后才通过，保留首错。

## DOT 复核的所选行为集合

下面是正式执行/接纳前的精确文件集合；case 状态和过滤集合须来自实际原件与源码，再绑定最终候选。相同输入合格证据先按现有机制核对；现有正式机制不接纳的项由唯一选中作业执行一次。测试数量不作为门槛。

1. 作者/来源/结构：`integration/educationPrivateComposition.postgres.integration.test.ts`、`integration/educationPrivateCompositionLocks.postgres.integration.test.ts`、`integration/educationLibrarySourceCatalog.postgres.integration.test.ts`。
2. 私有完整能力与受众：`integration/educationPrivateCompositionPublication.postgres.integration.test.ts`、`integration/educationPrivateCompositionExecution.postgres.integration.test.ts`、`integration/educationSchoolCompositionExecution.postgres.integration.test.ts`。
3. 获授权来源：`integration/educationPublicFormComposition.postgres.integration.test.ts`、`integration/educationPublicStandardComposition.postgres.integration.test.ts`、`integration/educationLibraryComposition.postgres.integration.test.ts`、`integration/educationLibraryCompositionExecution.postgres.integration.test.ts`、`integration/educationLibraryCompositionPreview.postgres.integration.test.ts`。
4. 已知边界：`integration/educationCompositionPreviewBoundary.review.postgres.integration.test.ts`、`huiteacher/assessment-runtime-composition-page.review.test.ts`、`integration/educationLibraryNumericFreeze.review.postgres.integration.test.ts`、`integration/educationScientificHash.postgres.integration.test.ts`。上述路径均相对 backend `src/__tests__/`。
5. UI：新增 `components/education-tools/EducationCompositionPreviewBoundary.review.test.tsx` 的两条不同预览边界；按原 A/B 已交付的精确用例/输入接纳；当前差异中的共享 Studio、公共来源/库选择、School/Teacher 消费和反馈，以及 B 两管理页的原有定向测试。原件未到本节点的状态为 UNKNOWN，不把父线口头通过当成正式接纳。只补真实缺失或输入变化失效的断言。

## 执行接线与预算

| 层 | 现有入口及前置 | 本批待完成的接线 |
| --- | --- | --- |
| 接纳/分类/报告 | `fetch-ci-base.mjs` → `content-scope.mjs`；既有 `school-teacher-scope.mjs` / `school-teacher-checks.mjs admission` 负责完整 raw diff、原始来源和精确输入。 | 旧 School/Teacher 入口固定旧分支及旧 base。本批需独立候选配置并复用既有执行器，保留旧记录；绑定本批完整差异、最终传递闭包、确切 passed/filtered 集合和实际 jobs/needs。现阶段尚未接线，不能激活。控制预检预算约 5 分钟，失败先定向排错。 |
| 类型与行为 | 前端锁定依赖及 backend Prisma 生成类型；既有 `frontend` / `postgres` 阶段执行类型、lint 和所选 Vitest 批次。Vitest exit 0、零失败、必需断言完整且过滤吻合共同成立；单独 anti-skip reporter 不足。 | 使用上列行为集合及核对后的 UI 精确集合。PG 只用当前 run 的新合成服务；School 夹具显式提供合成 `CAMPUS_ELIGIBILITY_HMAC_KEY`，同时具备实际测试加密/签名设置及一致的三个隔离数据库 URL。真实容量、身份与紧急停用保留。预算前端约 8 分钟、PG 约 12 分钟。 |
| 迁移/恢复 | `npm run db:migrate:guarded`；既有 `migrate` / `restore` 的非空基线、运行时角色和真实 dump/restore。 | 更新本批非空普通问卷/授权/冻结事实的保留集合。当前新库 deploy 不能替代这项资格。与 PG 共用本批服务，不再另建整个平台旅程。 |
| 单次构建与浏览器 | 既有 `frontend` / `backend` producer 及 `ci-artifact.mjs write/verify`；浏览器消费同 SHA/run 的真实 dist，沿用受限合成身份、正式 Chrome sandbox 和真实断言报告。 | 原旧浏览器矩阵不覆盖新增普通问卷。补 School/Teacher 选择来源→编制冻结→分配→作答保存→仅获准反馈的受影响短流程；选定 UI/浏览器配置后才冻结矩阵。构建各一次；浏览器约 8 分钟，失败保留产物后定向续接。 |
| 安全与合并 | 所选既有路线的 HIGH/CRITICAL 审计、真实 CodeQL/security-extended，以及完整 needs 驱动的 `merge-gate.mjs`。 | 保留既有门禁含义及 required checks/保护。最终 scope 选择出的其他必需项须真实成功；本计划不自动裁掉它们。审计/SAST 可与行为验证并行，按既有超时约束。 |

当前正式 CI 为 NOTRUN。先由 DOT 读取修复差异和上述所选集合，确认本批接纳/浏览器矩阵及接线方案；完成精确控制接线和独立复核后再启动一次适用正式 CI。Draft PR 保持 [skip ci] 提交。实际合并须由 DOT 核对该 PR 的最终候选及全部适用门禁后控制；本线不调用 APPROVE、不改保护、不 force、不部署。

# 首批 SELF 普通问卷：冻结收尾及 CI 计划

本批来源固定为 `9fa3c51e5deb882beb4a0d56f1ebe44dae8f76f5`，main 基线经只读确认仍为 `9801107019d51a4af7ddb651789b674867539d24`。独立发布分支 `release/education-self-scale-form-20261028`。R3 修复为 `d112757b3`；此文不是最终 CI source/head/tree 冻结记录。

交付边界是 School 学生 SELF、Teacher 教师 SELF 的私有与获授权 Scale/Form 普通问卷：选择与编制、说明、冻结、分配、作答、恢复、保存和获准反馈。后续他评、认知/SJT、复杂整包引用另批。当前 Form 适配器对跨页条件和全局素材明确拒绝；保持原版内容，不能把这类来源算作本批已支持。B 已合入的现有管理页缺陷修复随共用消费者保留。

## 当前证据

- R1/R2 修复及增强回归已在 ff528cafa；9fa 又扩展了展示白名单的 SQL 投影。需核对最终原件及消费输入，再决定哪些证据仍有效。本线未重复诊断或重跑它们。
- B 两项修复及 privacy fixture 已在固定父链；8756addf5 与 c55d6d721 的八控制 patch-id 完全相同。前轮八项控制与已有 UI 的本地结果保留；本轮 CI 控制输入已变化，仅续验受影响的控制合同，本地不重跑业务/UI。
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

6. 直接改变的共用合同消费者：`education-tools/access.test.ts`、`education-tools/capabilities.routes.test.ts`、`education-tools/private-tool.run-contract.test.ts`、`assessment-runtime/education-block-presentation.test.ts`、`measurement-content/admin-authority-route.test.ts`、`measurement-content/training-standard-combination-boundary.test.ts`、`reporting/education-assessment-report.projector.test.ts`、`scale/scale-presentation.test.ts`；真实边界补入 `integration/educationToolAuthoringAccess.postgres.integration.test.ts` 和 `integration/educationPublicSourceUse.postgres.integration.test.ts`。它们分别约束入口作者、显式授权、共享 runner/报告与原 Training 分支，不能仅用本批成功自评流程推断这些合同通过。

## 精确执行接线（等待 DOT 复核后激活）

候选配置为 `.github/scripts/school-teacher-self-bindings.json`，单独绑定本分支、main 基线、完整 raw diff 的 blob/mode、共用组件 tree、控制文件 after blob 及确切 passed/filtered 集合。配置初始 `enabled=false`、`review.completed=false`；不能凭本线自行勾选独立复核。完整组件 tree 包含传递源码、测试夹具、schema、迁移、包依赖和配置；Node/PG/存储环境同时由现有执行入口核对。该闭包是保守的组件范围，不声称支持未来任意模块的细粒度跨提交接纳。

A 最终原件 82 个目录项已逐 SHA 核对，CP14 声明的 23 项输入与本线一致；更早 CP12/13 的部分消费输入已变化，原件声明也不等于完整传递闭包。既有 fresh 路线明确拒绝私有历史接纳，本轮不新增接纳系统、不把 A/B 本地通过改称 CI PASS；按最终选择交给唯一正式作业执行，本地不再复测相同业务输入。`vitest list --json` 只用于收集真实名称，未执行断言，不能计 PASS。保留所有旧 FAIL 与过滤记录。

| 实际作业 | 实际入口 / 前置 | 证据和范围 | 预算 |
| --- | --- | --- | --- |
| scope | `fetch-ci-base.mjs` → `content-scope.mjs` → `school-teacher-scope.mjs` | 固定 branch/base、source/checkout tree 相等、完整差异、控制 after blob；已存在的 merge-gate 重算同一计划。 | 5 分钟 |
| admission | `school-teacher-checks.mjs admission`；`node --test .github/scripts/school-teacher-self.test.mjs` | 拒绝未独立冻结、丢 marker、手动/全量降级、旧证据、缺源；仅本轮新控制合同。 | 5 分钟 |
| frontend | `school-teacher-checks.mjs frontend`；锁定依赖、仅 Prisma 类型生成 | 现有 `npm run typecheck`、受影响文件 lint、所选组件 Vitest、一次 `vite build`；输出当前 SHA/run 的不可变 dist 和规范报告。FinalComposite 与私有单工具编辑器只选实际交界消费者，其余用例明确过滤。 | 12 分钟 |
| backend-self | `school-teacher-checks.mjs backend`；锁定依赖、Prisma validate/generate | 一次实际 `tsc -p tsconfig.json` 产生后端 dist；不在 PG/浏览器重复编译。 | 12 分钟 |
| postgres-self | `verify-backend-artifact` → `migrate` → `postgres` → `postgres-restore` | 新合成 PG16.15/Redis；非空精确 main 升级；上列 25 个文件合为 5 个受影响批次；当前真实 native/declared 结果、冻结来源和科学 DDL 一次 dump/restore；完整行/列/hash、受限运行时角色及 release schema。显式合成加密/校园 key，不替代真实容量或权限校验。 | 25 分钟 |
| browser-self | `verify-backend-artifact` / `verify-frontend-artifact` → 当前 schema deploy（仅新服务初始化）→ `seed` → `school-teacher-browser.cjs` → `browser-report` | 同 SHA/run 的两个 dist，原正式 Chrome sandbox、真实登录/同意/HTTP/生产入口。School/Teacher 各一条：原批准共用量表来源 + 自编 Scale/Form → 普通问卷编制/预览/冻结/重开 → 分配 → 单 parent 作答/保存恢复/FINAL → 获准与 withheld 反馈、作者拒读。新来源只通过正常 Survey 发布、库审核和原 U 授权产生；不 seed 问卷、分配、答案或 FINAL。四张脱敏截图。复用现有浏览器执行器，标 `SELF_COMPOSITION`，不声称通过旧主题/全部题型视觉矩阵。 | 25 分钟 |
| security / codeql | `school-teacher-checks.mjs audit`；既有 CodeQL `security-extended` 实际应用路径 | 前后端 HIGH/CRITICAL 审计；真实 SAST。与行为并行，保留原阈值/门禁含义。 | 8 分钟 / 既有上限 |
| qualified / merge-gate | `school-teacher-checks.mjs aggregate`；既有 `merge-gate.mjs` | 所选六作业必须 success；旧 connected 仅本批显式 skipped；未知、缺失、失败、取消不接纳。根 gate 仍要求 scope + school-teacher + codeql。不改 required checks 或保护。 | 5 分钟 |

`migrate` 的新非空夹具仅为技术保留证明，没有伪造 ONLINE 或科学发布事实；正式 `postgres-restore` 必须先有当前真实 PG 批次合格报告，并恢复其实际 source/result 表。浏览器复用同 run 产物、单独空服务初始化，不再重复非空升级资格或 dump/restore。新增控制用本地隔离 PG 预检时明确标 `LOCAL_PRECHECK`，不冒充 Actions 或完整作答恢复资格。

本线科学迁移为 `20261028223000_education_scientific_freeze_hash`。A 在交接时另有已运行实现 `bd251371fa7dea7726a365550329de4ee42fbd32` / `20261028230000_education_scientific_definition_hash`；未混入本线，也不借其结果证明本线迁移。实际 merge 后由 DOT 协调 A 一次 main 对齐、去重两套迁移/函数/测试。

当前正式 CI、真实浏览器、构建均 NOTRUN。接线本地控制及非空存储预检另留原件。非空迁移/真实 dump-restore 与受限角色本地预检已 PASS（8 表、9 行、科学函数定义逐项一致），临时容器及匿名卷已移除；这是 LOCAL_PRECHECK，不是当前真实结果的正式恢复资格。受影响旧控制测试暴露了两处 YAML 文本格式假设（if 前缀/折行），原失败保留，改为核对实际条件与规范化空白后，仅该用例续验 PASS；业务断言未放松；不会把收集、语法或静态审查计作业务 PASS。DOT 读实际 YAML/选择器/报告/needs/候选后才准备激活一次；draft 和 [skip ci] 保留。实际合并由 DOT 核对最终 PR 全部门禁后控制；本线不 APPROVE、不改保护、不 force、不部署。

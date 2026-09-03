# Unified Assessment Bundle v1.0 实施计划

本文件是本分支的产品与实施规范原文（用户提供）。实现以本文为准；与 `main` 现状的差异见同目录其它基线文档。

## 1. 开工与 Git 基线

- 开工时只使用 `/Users/Qiang/Documents/eduK12-dev`：
  1. 获取最新远端状态。
  2. 核验 status、当前分支、HEAD、worktree、main 与 origin/main ahead/behind。
  3. 本地 `main` 只能 fast-forward 到稳定的 `origin/main`；出现分叉立即停止。
  4. 核对最近合并 PR 与 Bundle 相关文件的重叠范围。
  5. 检查 compose 项目、四个 `ptool-*` 服务、运行镜像与准确 HEAD 的对应关系，以及全部持久卷；不得假设镜像来自最新 main。
  6. 跑完整基线测试并保存结果。
- 基线确认后创建 `feature/unified-assessment-bundle-v1`；若远端名称冲突，停止并汇报后再采用带日期的等价名称。
- 冻结的 `feat/mental-health-bundle-v1` 只做 REUSE/ADAPT/REIMPLEMENT/IGNORE inventory，不整分支 cherry-pick。
- 全程一个大型 PR、多个语义 commit；main 再有变更时，将最新 `origin/main` 合入 feature 分支并重新跑完整回归，禁止直接修改 main。

## 2. 核心架构与公开契约

### 统一 Bundle runtime

新增统一契约：

- `AssessmentBundleDefinitionV1`
  - 精确 key/version、类别、目标人群、respondent 约束。
  - COGNITIVE/SCALE/FORM slots。
  - engine、context、report 与 publication gates。
- `FrozenAssessmentBundleSnapshotV3`
  - 冻结 Bundle、slot、engine、ruleset、报告、Context、授权和定义哈希。
  - 旧 v1/v2 snapshot 保持原样，由显式 compatibility parser 读取。
- `EvidenceItemV1`
  - 来源：`COGNITIVE_METRIC | SCALE_SCORE | CONTEXT_FACT`
  - 角色：`PRIMARY | SUPPORTING | CONTEXT | SAFETY`
  - namespaced `ConstructKey`
- `BundleReportFactsV1`
  - 通用 envelope 加 discriminated engine payload。
  - 保存 identity、源结果、质量、规则、限制、建议、Context 哈希和完整 provenance。
  - 渲染 HTML/Markdown 不作为权威结果。
- `BundleContextFactsV1`
  - Bundle 特有 Context 的版本、定义哈希、归一化 facts、冻结时间与快照哈希。

实现真正的 `BundleAnalysisEngineRegistry`，按精确 key+version dispatch，彻底删除 package-key 特判。首版引擎：

- `cognitive-domain-v1`
- `scale-evidence-v1`：WHO-5/TEXI 等严格描述性 Scale 报告，避免滥用心理健康语义。
- `mental-health-rule-v1`：CORE/FACET/CONTEXT/SAFETY。
- `integrated-evidence-v1`

Scale slot 支持一次选择多个 score key；分类只能读取冻结 `criterionBand.key`，禁止从显示标签推断。所有引擎只读取冻结 Cognitive Result、ScaleResultV2 和 ContextFacts，不读取原始 trials/answers，不重新计分。

### Persistence 与 reanalysis

采用 additive migration：

- Attempt 增加 subject、respondent、respondentType、episode、assignment、consent 和 Bundle Context 快照引用。
- 新增 `AssessmentEpisode`；教师 campaign 按 subject 建立 episode，家长自助测评建立独立 episode。
- CompositeAnalysisSnapshot 增加新 engine/version 查询元数据，但继续保存加密 payload。
- 历史行保留 null/unknown，禁止根据旧 `userId` 猜测 subject/respondent。
- Reanalysis 管理接口改为显式 `{ targetBundleKey, targetBundleVersion }`：
  - 只复用原冻结单项结果和 Context。
  - 目标版本必须声明兼容这些源版本。
  - 缺少新版本必需 Context 时拒绝。
  - 永远新增 snapshot，不覆盖旧结果。
  - 新分析触发 safety 时创建新 case；旧 case 不得因新结果自动关闭。

现有 ReportPackage、CompositeAssessment、创建、作答、匿名恢复、导出 API 保持兼容；catalog 响应增量加入 bundleCategory、engine、respondentTypes、initiationModes 和 release gate，不进行全面 API/表名重写。

## 3. 新增产品子系统

### 家长与教师观察者流程

- 新增 `PARENT` 账号角色和独立家长界面。
- 家长—学生为全局多对多、可撤销、不可物理删除历史的关系。
- 学生从自己的有效课程中选择一门并生成单次、限时、哈希保存的邀请码。
- 新家长凭码提交待审注册；已有家长凭码提交新增关系申请。
- 只有邀请码绑定课程的创建者或管理员可批准；批准后关系跨课程有效。
- 当前 main 的学生注册实际为自动 ACTIVE；开工时重新核对即将合入的 PR，但家长审批不得依赖不存在的学生审批字段。
- 支持两种他评发起：
  - 教师为课程学生分配 observer Bundle，向每位获批家长生成独立任务。
  - 家长从允许自助的 PUBLISHED 目录为已绑定孩子发起。
- 家长自助结果默认私有，可显式分享给当前有权限的课程负责人；教师分配结果按作答前同意向分配教师开放。
- 家长只能查看自己作为 respondent 生成的投影，不得查看孩子自评、其他家长/教师原始答案或跨 informant 报告。
- 关系建立和每一次作答分别保存 consent version/hash、用途、可见范围、分享对象和接受时间。
- 教师只能为自己有有效 roster 权限的学生进行 teacher-report。
- 本 PR 不实现 SELF/PARENT/TEACHER 综合分析或平均分。

### 授权管理与动态发布

新增管理员“测评内容授权”入口：

- 授权记录保存 instrument/version、授权方和被授权方、电子施测、评分、翻译、展示、地区、语言、商业性质、有效期及授权依据。
- 同一管理员可提交并批准，但必须填写确认声明；批准、修改、撤销均写入 append-only audit，批准后的修改生成新版本。
- 授权邮件后续上传到仅管理员可读的 `StoredAsset`，登记 SHA-256；邮件未上传时状态为 `EVIDENCE_PENDING`，只告警、不阻止已批准内容发布。
- Bundle/Scale 的代码定义与环境实际发布状态分离；管理员点击 Publish 时统一校验科学、权利、语言、报告、安全和 golden/negative gates。
- `EXPIRED/REVOKED/SCOPE_MISMATCH` 后立即停止新建并从目录转 HOLD；已开始 Attempt 只能完成到创建时冻结的原截止时间，不允许延长。
- 所有使用外部授权内容的 Attempt 必须有有限截止时间：
  - Scale/observer 默认最多 7 天。
  - Cognitive/Integrated 默认最多 24 小时。
  - 教师 campaign 有更早截止时取更早值。
- 历史已完成结果继续保留；题目文本的历史展示遵守授权记录中的终止后保留策略。
- WHO-5 只有在部署配置明确为 `NON_COMMERCIAL` 时可发布，否则自动 HOLD。

TEXI 简体本地化纳入本 PR：固定源版本和 item codes，完成翻译、回译、术语审核、大陆语言审核及签字 manifest；只做描述性解释，不声称大陆常模。授权证明可后补，但管理员必须先录入并批准授权范围。

### 站内安全闭环

- 管理员创建、版本化并批准 SafetyPolicyTemplate；课程负责人只能绑定主责和备份，不能修改规则和时限。
- safety-capable 测评若未冻结策略、主责、备份、确认/处置时限和升级链，不得发布。
- 实现持久 SafetyCase、append-only 事件日志、站内通知、确认、处理中、行动记录、解决、转介和超时升级。
- 使用 Redis/Bull 延迟任务和数据库 reconciliation 保证重启、重复投递和并发下幂等。
- 内部 case 仅主责、备份和授权管理员可见；学生/家长只看到审核后的报告指引。
- WHO-5、SDQ、TEXI、ADEXI 的低分不得被自行解释为危机信号。
- 首版生产 Bundle 不触发 safety；完整流程由内部 test-only authoritative safety fixture 做端到端验收。
- 不接邮件或短信，不引入 LLM。

## 4. 首发 Bundle 与实施顺序

### PUBLISHED 清单

1. `cognitive_response_inhibition_v1`
   - Go/No-Go + SST
   - Cognitive-only、描述性领域画像、无认知总分。

2. `wellbeing_who5_youth_self_zh_cn_v1`
   - 9–18 岁本人自评。
   - 官方中文题目、原始分及百分制分。
   - 非商业、描述性，不将阈值称为中国常模或诊断结论。
   - 来源以 [WHO 官方 WHO-5 页面及中文版](https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01) 为准。

3. 四个独立 observer Bundle
   - `sdq_parent_observer_zh_cn_v1`
   - `sdq_teacher_observer_zh_cn_v1`
   - `texi_parent_observer_zh_cn_v1`
   - `texi_teacher_observer_zh_cn_v1`
   - 不合并 SDQ 与 TEXI，不跨 informant 综合。
   - SDQ 电子评分/施测必须绑定管理员批准的授权记录；官方明确将计算机评分纳入许可管理，[并提供官方简体中文版本](https://www.sdqinfo.org/py/sdqinfo/c0.py)。
   - TEXI 限 13–19 岁、授权简体本地化、描述性解释；原始验证人群边界来自 [TEXI 研究](https://pubmed.ncbi.nlm.nih.gov/32090688/)。

4. `integrated_gonogo_adexi_adult_zh_cn_v1`
   - Go/No-Go + 已授权 ADEXI 中文 self-report。
   - 严格限制 subject 18+。
   - 只输出 complementary cross-method evidence；无参考阈值时不得声称 convergence、divergence、异常或诊断。
   - ADEXI 的成人边界依据其 [原始成人验证研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC6877129/)。

### Commit 顺序

1. 基线、incoming-main 冲突审计、旧分支 inventory。
2. Unified contracts、Evidence、Facts、snapshot v3 和 compatibility parser。
3. Registry 与 generic engine dispatch。
4. Cognitive adapter 和 Go/No-Go+SST Bundle。
5. Multi-score Scale extraction 与 `scale-evidence-v1`。
6. `mental-health-rule-v1` 和规则/feedback 版本化。
7. Bundle ContextDefinition、冻结与加密。
8. BundleReportFacts、projector、audience、export。
9. 授权管理、动态 publication overlay 和管理员 UI。
10. WHO-5、SDQ、TEXI 本地化和 Scale package gates。
11. subject/respondent/episode、PARENT、邀请、审批和 consent。
12. 教师分配、家长自助、报告分享与 observer UI。
13. Integrated engine 与 18+ Go/No-Go+ADEXI。
14. Safety policy、case、通知、升级 worker 和员工 UI。
15. 显式版本 reanalysis。
16. 全量 E2E、安全、迁移、性能和兼容修复。
17. 两轮独立 review、最终 main merge、完整 gate 与 PR 整理。

每个 commit 后执行 focused tests、相关 integration、lint、typecheck、build 和 schema validation；关键阶段追加前后端全量测试。

## 5. 测试、验收与资源安全

### 必测场景

- Registry：未知 engine/version、重复 key、snapshot hash/definition tampering、旧 snapshot 回放。
- Cognitive/Scale/Integrated：valid/limited/invalid、缺源、版本不符、多 score selector、无参考时禁止分类、描述性 integrated。
- Context：required/optional/type/enum、归一化、加密、幂等冻结、冻结后修改、损坏密文、定义版本不符。
- Identity：
  - SELF、PARENT、TEACHER、subject != respondent。
  - 多家长/多孩子、邀请码过期/重放/暴力枚举、错误教师审批、关系撤销。
  - 教师分配、家长自助、默认私有、显式分享、relationship + per-attempt consent。
- Rights：
  - 单管理员批准、批准后版本化。
  - EVIDENCE_PENDING 只告警。
  - 到期/撤销停止新建、在途按冻结截止完成、截止后锁定。
  - 非商业部署 gate、locale/territory/scope mismatch、私有证据资产 IDOR。
- Safety：
  - 原子建案、重复完成幂等、主责/备份、确认、处置、超时升级、重启 reconciliation。
  - 未授权人员不可见；普通低分不触发；reanalysis 不自动关闭旧 case。
- Reports：student/parent/teacher/admin audience、历史 snapshot 导出、原始答案和敏感 Context 不泄露。
- E2E：上述七个 PUBLISHED Bundle、observer 四条路径、anonymous self flow、现有 standalone Scale/Cognitive/Composite 回归。
- Migration：空库 apply、当前 schema 升级、历史 fixture replay、rollback strategy review、Prisma format/validate。

### 隔离与清理

- 所有数据库集成测试使用专用测试数据库和独立 compose project，不连接共享 `ptool-postgres`。
- 每次运行记录本任务创建的 user、course、scale、assessment、attempt、episode、relationship、authorization、safety case 等 fixture ID。
- 只清理本任务 fixture、一次性容器、网络和临时卷。
- 禁止 `docker compose down -v` 作用于共享 runtime，禁止删除既有 persistent volumes。
- 结束时重新验证 `ptool-frontend`、`ptool-backend`、`ptool-postgres`、`ptool-redis`、运行镜像、compose project 及所有既有卷，包括当前 compose 中的 exports volume。
- PR ready-for-review 条件：前后端全量测试、0 非预期 skipped、typecheck/build/lint、迁移、授权/安全/IDOR/tamper、依赖审计全部通过。

### 固定边界

- 不实现 History Engine、Cross-Informant Analysis、实时 LLM、诊断或新心理计量综合分。
- 用户确认 SDQ/TEXI 授权已取得；首次发布可由管理员批准的授权声明支撑，原始邮件随后补挂。
- 若实施时获准题目或评分源文件仍不可获得，只阻断对应具体 package 的内容落地，不允许开发者自行编造题目、翻译或评分规则。

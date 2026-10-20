# 测量内容三层版本：V01 实施合同

状态：V01 范围及合同已冻结；后续单元尚未实现，不代表功能上线。
依据：[用户确认的 v1.1](https://docs.google.com/document/d/1fLJ3bn6r5zscpUSaPYuQrbf3UW0RaIvCE3nmKmcVUfU/edit)，2026-10-20，第 12 节 1A–6A、7B，第 14 节 V01–V10。
范围补充：用户在 V01 开发期间明确本批包括既有情境测验（SJT）的版本功能升级，V04/V08 据此收敛；不扩编制器。
实际远端 main 基点：`c3f9a7e77447c706f4a83a93c7429a7bcb164e94`。独立工作分支：`work/measurement-version-v1-20261020`。Training 候选 `8ce879e5` 与 main 等内容不代表同一历史；本分支从实际 main 创建。

## 1. 范围与唯一权威

- Scale、现有 Cognitive 与现有 SJT 共用发布身份、状态、绑定与治理合同；保留各自权威 scorer 和 runner。按用户最新范围，SJT 现有内容/专家评分 key、参考/报告须接入三层版本及回读绑定，不是未来空占位；本 PR 不增加完整 SJT 编辑器或新运行范式。
- 三层依次为测量本体、参考规则、报告。发布身份各自演进，目录是可发现性投影，不能另存评分/阈值权威。私有作者获准范围内 publish 不依赖平台目录批准。
- 复用已有七轴：instrumentVersion、scoringVersion、reportVersion、referenceVersion、localizationVersion、catalogManifestVersion、InstrumentAuthorization.version。measurementHash 是内容指纹，不替代授权版本轴；授权轴不进入测量指纹。三层不是把七轴合成一个版本号，也不是再建三套服务。
- 复用 `scale-definition.ts`、`scale-scoring.ts`、Scale onboarding、Reference Core、Cognitive v2 registry/scorer/session snapshot、共享 runtime artifact/template 和冻结 binding。`assessment-identity` 是被试/作答身份，不是内容发布身份；保留其“历史未知不补造”的规则。
- 不新增连续年龄模型、新认知范式/runner、上传脚本执行、外来常模表直接激活、生产真实常模或生产部署。授权内部样本离线分析后回流的候选仍须受控复核。
- 不长期双写或保留旧权威 runtime。一次迁移先盘点，再按已确认对象切换；真实不可逆删除、凭据及安全配置变更不在授权内。已应用 migration 不改写。

修改组件 → 三层发布/编制/绑定/结果/导出及受影响四入口；具体故障 → 内容覆盖、越权、版本漂移、重复计分和事实污染；主要执行位置 → 云端本地开发及必要定向检查，最终集中功能/独审后正式 CI；复用 → 输入未变的有效证据；预算 → V01 文档/路径核对约 15 分钟，后续按单元报告实际进度，不加压力或性能对照。
V01 不改生产代码、数据库、账号或发布规则；只运行文档差异检查。应用检查尚未执行，不能标作通过。

## 2. 能力与资源矩阵（语义，不是新角色枚举）

能力必须与资源、业务范围、期限及来源许可同时满足。内容操作不授予个人数据访问。

| 操作组 | 必须限定的对象 | 允许的效果 | 不自动包含 |
|---|---|---|---|
| measurement.edit / publish | family、作者/项目/课程、稳定 key、来源身份 | 编辑草稿、发布不可变本体 | catalog.manage、reference.publish、他人内容编辑 |
| material.use / adapt / distribute | 精确来源、允许 release 范围、入口/组织、用途、语言/地域 | 使用、获准改编为新身份、限定分发分别判断 | 使用不含改编，再分配不扩大上游许可 |
| catalog.manage | 平台目录与获准 family/key | 上架/撤下目录投影 | 私有发布审批、科学审核、个人数据 |
| reference.analyze / review / publish | 授权样本范围、精确测量/指标、项目或跨入口用途 | 候选、复核、不可变参考发布分别判断 | 原答案访问或平台常模资格的隐含升级 |
| report.edit / publish | 报告系列、受众、语言、测量兼容范围 | 草稿预览、独立发布 | 原始分数、正式阈值或质量规则修改 |
| data.read / export / reinterpret | 当前个人/项目/课程范围、事实及解释工件 | 当前获准数据读取、分别导出、显式新解释 | 内容编制、全学校答卷、自动批量重解释 |
| delegate | 上游可委派操作、资源、入口/组织/项目、期限 | 给下级交集范围 | 横向入口、扩大期限或来源权利 |

上表是本 PR 永久内容域的细粒度能力；V05 在既有 User 上实现精确资源授权，管理员 PR 提供 principal、入口资格与近期强认证基座，不提供这些科学/内容能力。不得另建账户角色或 MFA。businessRole 与管理 grant 正交；入口管理资格不得隐含该入口业务身份。后端对象范围为权威，菜单/深链/API 一致；仅隐藏按钮不算授权。
管理员 PR 当前不在本基点，不能当作已经合并。内容能力核心与现有受控私有报告服务可先实施；系统签发授权入口需对齐最终 main 的近期强认证后开放。

## 3. 四入口编制与消费映射

| 入口 | 编制入口及既有实现 | 本 PR 目标 | 消费/边界 |
|---|---|---|---|
| Training | `pages/ScaleEdit.tsx`、`ScaleCsvImport.tsx`；`routes/scales.ts` 的 definition、import、preview、publish | 保留自编 Scale、导入及课程私有发布，接同一发布核心 | 课程/任务绑定精确发布；Cognitive 仅既有 runner 可控参数；无权来源不可改编 |
| Survey | `survey/SurveyBuilder.tsx`、`ResearchScaleEditor.tsx`、`ResearchCognitiveEditor.tsx`；`survey/builder.*`、`publication.service.ts`、`waves.publish.ts` | 项目 ScaleDraft 与导入接共同定义/发布校验，私有 publish 不等平台上架 | Wave 冻结；现有 Go/No-Go 受控协议不等于实验编程器；项目数据不共享 |
| School | `modules/campus` 活动与报告流程、`school/SchoolCompositeRunner` | 主要消费获许可已发布资源 | 不新建编制页面；当前认知选用 UI 有限，不把 runner 存在声称为已开放 |
| Teacher | `modules/huiteacher`、已有 Form/Scale 业务 | Form 保持原权限；Scale 消费已授权资源 | Form 编辑权不扩为 Scale/Cognitive 编制；不复制 Training/Survey 编辑器 |

统一的是内容定义、发布产物、计分权威、版本引用；入口账号、对象关系、数据范围和发放流程仍归原模块。技术 publish 可独立完成；要求反馈的投放必须先绑定兼容可用 report，报告绑定不进入 measurementHash。

## 4. 三层字段、投影与生命周期

以下为目标 DTO/持久化语义；已有字段映射见第 8 节。物理表可复用，不要求每个 DTO 单独建表。

共同发布信封：`layer, family, key, releaseId, version, hashScheme, contentHash, scope, source, assetRefs, createdBy, publishedBy, publishedAt`。发布后内容不可覆盖；同 key/version 不同内容拒绝；同内容重试复用精确发布身份。生命周期及目录可见性在信封外管理，不改变内容 hash。

| 层 | hash 的 canonical 投影 | 精确绑定 | 不入本层 hash |
|---|---|---|---|
| measurement | 题目/刺激 key、响应、维度、评分公式/插件版本、质量约束、施测语言、时长/试次/随机/输入计时协议、必要资产摘要；既有 measurement projection 显式标 hashScheme | instrumentVersion、measurementHash、scoringVersion、runner/engineVersion、localizationVersion | 报告模板、reference policy/发布、目录介绍、授权期限、展示性版权备注 |
| reference | 逐 metricKey/现有 scoreKey 的 ReferenceKind、测量/评分兼容身份、population、statistics、可选 bands、方法/来源/限制及证据快照 | referenceReleaseId/version/hash、measurementReleaseId/hash、metricKey、kind | 目录、状态、报告措辞；不重新定义 raw score |
| report | 可展示指标、受众/语言、文字/图表/布局/冻结媒体、兼容约束与生成器版本 | reportReleaseId/version/hash、精确 reference 绑定结果和事实 ID | 数值阈值实体、评分规则；不得复制成第二规则源 |

复用 `assessment-runtime/canonical.ts` 的稳定 JSON/hash，使用明确新投影版本；现有旧 hash 不以新算法静默重算成同一 identity。非有限数字、未知字段/资产及不支持 runner 在发布校验中拒绝。hash 不能替代来源授权。

状态语义：DRAFT 可编辑；PUBLISHED（Reference Core 对应 ACTIVE）可新绑定；SUPERSEDED 正常后继仍可历史读取；RETIRED 停止新选；REVOKED 错误/许可/严重问题撤回，记录原因、责任人、影响范围及时间。已发布内容状态不回 DRAFT，恢复须明确新发布。正常替代不能导致历史读取要求 ACTIVE。
错误撤回保留旧工件并附撤回提示，阻止受影响新解释；修正后显式生成新解释。计分错误另存修正事实及原事实关系，不覆盖旧分数。读取历史仍检查当前数据访问权。

## 5. 投放、START、FINAL 与报告请求

投放合同：`bindingId, measurementReleaseId/hash, referenceSelectionPolicyVersion, candidateReferenceReleaseIds[], reportReleaseId/hash, audience, language, frozenAt`。候选集合可空，新增常模不自动加入；报告与测量兼容检查不建立循环 publish 依赖。
START 冻结必要人口/设备/协议上下文，逐 metricKey 只在投放候选集合中确定选择。保存 `referenceKind, releaseId, version, hash, applicability, selectionReason`；无参考、缺人口、冲突均记录明确降级理由，不默认套用名为“总体”的版本。并列参考必须有确定规则；歧义不输出比较。
FINAL 以既有 submissionId/payloadHash/epoch 原子接收：正常成功路径一次权威 scorer，重放返回同一事实，payload 冲突拒绝。报告使用事实，不重跑 scorer；继续沿用现有持久报告任务，不另建三套队列。
报告首次生成前原子持久化 `requestId, inputHash, factId, reportReleaseId, actualReferenceBindings, audience, language, purpose, generatorVersion`。重试沿原请求及冻结输入，不重新选最新；同 requestId 不同 inputHash 拒绝。
显式新解释新增 requestId 和工件，保存 `reason, actorId, previousInterpretationId`。唯一内容键包含事实、报告、逐指标实际参考、受众、语言、目的；相同内容可共享字节，操作记录不得省略。

## 6. 原始事实与分离导出（7B）

原始事实字段：response/session/attempt ID、入口和业务范围、measurement release/hash、scoringVersion、item/trial key、raw answer/reaction、开始/提交时间、计时单位、施测协议、允许采集的冻结上下文、quality、原始数据摘要。未知身份保持未知，不从 legacy userId 推造 subject/respondent。
计分事实字段：`factId, factVersion, rawRecordId, measurementReleaseId, scoringVersion, metricKey, rawScore, unit, direction, missingReason, comparabilityReason`；保留现有加密与原始记录唯一性。
解释字段：`interpretationId, factId, referenceBindings[], reportReleaseId/version, audience, language, requestId, generatedAt, generatorVersion, contentHash, previousInterpretationId`。

默认原始导出只含 rawAnswers/rawScore 及必要版本/质量/来源字段，不隐含 norm 转换、经验区间、报告文字。专门 interpretation 导出要求显式选择解释工件或冻结版本，列名分别为 referenceValue、thresholdConclusion、reportInterpretation；修正分数标 correctedScore，不复用含混 score 列。
两类 manifest 均含 `exportId, schemaVersion, kind, filters, cutoff, recordIds, factVersions, interpretationVersions(仅解释), measurementVersions, scoringVersions, generatorVersion, checksum`。可用同一真正不可变快照的确定查询替代逐 ID 清单；单独时间截点不够。
相同 exportId 返回同一工件；“当前最新”使用新 ID。跨测量版本默认分组，题号相同不代表 item 相同。列/单位/编码变化升级 schemaVersion。导出过期可按冻结清单重建且验证 checksum，或明确 unavailable；隐私撤回不允许同 ID 悄悄换内容。
小型 manifest/定义/资产共享保留；需要字节保真的交付文件保存实际字节。不能靠可变外部图片 URL 重建历史报告。

## 7. 七项决定的实现落点

| 决定 | 接口/页面落点 | 数据合同 | 验收负例 |
|---|---|---|---|
| 1A 有限委派 | V05 管理能力及素材分配，复用 admin 管理页面/API | 操作、产品/组织/项目、资源、到期及可委派交集 | 单入口跨入口授予、使用权变改编、期限/许可扩大均拒绝 |
| 2A 分层自主 | Training publish、Survey publication；catalog 独立操作 | owner/scope 与 catalog 状态分离 | 私有发布不要求平台批准；私有权不成为平台 norm 权 |
| 3A 分级审核 | V06 候选/复核/发布操作 | 样本冻结清单、方法证据、计算者、审核者、发布者及用途 | 正式跨入口 norm 计算者自审拒绝；未授权样本拒绝 |
| 4A 投放锁定 | 课程任务/Wave publish 与 START | 第 5 节 binding 及逐指标选择理由 | 新参考不得进入旧集合；首次生成失败不得漂移 |
| 5A 显式新解释 | V07 报告草稿/预览/发布/新解释及历史读取 | 新 request/interpretation 与 previous 关系、撤回提示 | 不覆盖旧报告/事实，普通替代不拒历史 |
| 6A 最小保留 | V09 盘点/迁移、共享资产、历史读取 | 引用清单、迁移映射、恢复点、unavailable | 有引用内容不能清理；无确认不删除真实数据 |
| 7B 分离导出 | V08 默认 raw 与专门 interpretation 导出入口 | 第 6 节 schema、manifest、checksum | 更新报告不改 raw 导出；同 ID 不变义/变字节 |

## 8. 源码复用与迁移对象盘点（未执行数据操作）

以下是基点源码对象清单，不是生产行数盘点；本 PR 未读取生产数据库，数量/保留决策须在实际迁移环境只读盘点后记录，不以 0 代替未知。

| 现存对象/权威实现 | 复用及迁移核对 | 禁止的捷径 |
|---|---|---|
| Scale.definition/definitionHash/instrumentVersion/copySource；`scale/onboarding/axis-snapshots.ts`、`scale_axis_snapshots` | 分离 report/reference 与本体，保留七轴、源草稿关系；确认旧 hashScheme 与精确源内容 | 仅凭名称或版本号补造 measurement identity |
| CognitiveTestConfig、Assignment resolvedConfig/report snapshot；`cognitive/v2/session-snapshot.ts` | 受支持配置建立 release 身份，沿用 runner/scorer、共享编译产物与冻结协议 | 上传脚本或新 runner、从现行 config 替换历史 snapshot |
| SjtAuthorRelease/BundlePackageRelease、`situational/situation-package.registry.ts`、现有 SJT 权威结果 | 现有内容/评分 key 纳入 measurement、水平分界归 reference、措辞归 report，发布与回读精确绑定 | 仅留未来占位或新增完整编制器/新范式 |
| AssessmentReferenceSet；`assessment-reference/reference.ts`、governance/lifecycle | 保留四种 ReferenceKind 和既有统计；补独立审核/撤回/逐指标绑定 | 用 status=ACTIVE 冒充审核或把任意阈值称 norm |
| Scale 内嵌 report、`cognitive-analysis/report-package.registry.ts`、`AssessmentPublicTemplate` | 提取独立 report 发布身份，保留已交付内容/生成器/资产 | 更新模板覆盖历史；在报告内另存正式阈值 |
| SurveyInstrumentDraft/Publication/Wave；`survey/builder.compiler.ts`、publication/waves.publish | 项目关系、definitionDigest、revision、波次冻结完整映射到同一发布核心 | 把项目私有发布改成平台逐件审批 |
| Assessment/AssessmentResultFact、CognitiveSession/RawSubmission、SurveyWaveFinal、SurveyCognitiveSession/Result | 原始事实及 epoch/submission/hash/加密不变；新增精确 release 引用及解释工件 | 从旧结果缺失信息编造身份、重新计分后覆盖 |
| AssessmentRuntimeArtifact/PublicTemplate/FrozenBinding、CompositeReportJob | 共享不可变内容与持久任务；绑定和个人事实分开，保留原始 receipt 恢复关系 | 每个结果复制整包，新增三套队列，长期双写 |
| ExportBatch/ExportArtifact、SurveyExportTicket；`training-analysis/export.ts`、`survey/analytics.raw-export.ts` | 默认 raw、独立解释，冻结 manifest/schema/checksum；保留现有权限/下载恢复合同 | 只存 cutoff、复用同 exportId 返回最新文件 |
| InstrumentAuthorization、ScaleDeploymentPolicy、Survey 与 Teacher 来源 grant/许可 | 上游来源许可保留；V05 内容域能力与现有来源许可逐对象取交集 | 复制授予体系，复制内容解除许可或改变 businessRole |

迁移记录最少包含源类型/ID/原 hashScheme/hash、目标 release/事实/工件 ID、关系完整性、处理结果、不可映射原因、对象计数、恢复点。不能无损映射的对象单列，保留冻结工件或请求决定；不以宽松 adapter 永久掩盖。
切换前检查所有仍有消费者的 Training/Survey/School/Teacher 调用方；新链路验收后一次切换、移除无消费者旧代码。真实旧数据删除名单另行确认。清理代码不授权清理记录。

## 9. 十个可恢复单元

| 单元 | 交付与依赖 | 完成证据 |
|---|---|---|
| V01 | 本合同、四入口/能力/字段/导出映射、非破坏盘点 | 文档路径与源码对象核对；未运行数据迁移 |
| V02 | 三层不可变发布模型、状态、共享资产引用/目录投影 | 同版本不同内容拒绝、三层独立 hash 与历史状态合同 |
| V03 | Scale 共用定义/导入/私有发布；依赖 V02 | 无 norm 发布、来源只读不可复制解锁、两编制入口 |
| V04 | 既有 Cognitive 受控参数/刺激及现有 SJT 三层适配；依赖 V02 | runner 不存在阻断、配置/专家评分 key 冻结、原施测/提交/回读 |
| V05 | 同 User 内容域能力/精确范围/一层委派 | 内容域负例先验证；最终 main 对齐系统强认证签发入口 |
| V06 | 内部授权候选、复核发布、逐指标选择及撤回 | 正式 norm 独立复核、冲突/缺字段降级、普通替代 |
| V07 | 报告草稿/预览/独立发布/显式新解释 | report-only 不变测量/参考、原报告保留、幂等请求 |
| V08 | 投放冻结、START、FINAL、raw/interpretation 导出，覆盖已有 SJT 结果版本 | 单次 scorer、旧事实不漂移、固定 manifest 与 checksum |
| V09 | 经过盘点的统一迁移和调用方切换/清理 | 保留对象可读、无双写/旧权威、无未批准真实删除 |
| V10 | 集中回归、独立 review、正式 CI 与收尾 | 受影响闭环/权限/数据库/浏览器证据，正式门禁成功才 merge |

每个可恢复 commit 交主负责人统一 GitHub 备份（不触发 CI），开发者不并行 push。最终集中验证与独立 review 后启动一次正式 CI 流程；真实失败修复针对性重跑，不能以“只一次”为由跳过失败。合并不自动部署生产。

## 10. 当前需实现而非假定已有的差异

- `ReferenceGovernanceV1` 当前经验规则硬编码 sampleN≥100、band sampleN≥20；V06 将改为有方法依据、用途及适用性复核的规则，不移除真实样本/来源/质量校验，也不声称已批准实际 norm。
- Reference Core 当前状态无 REVOKED；补充撤回语义，旧冻结读取不以 ACTIVE 作为唯一条件。
- `hashScaleDefinition` 对有 versionAxes 的定义已剔除 report/reference；无轴旧对象仍是旧投影。不得把已解耦逻辑重新实现为全定义 hash。
- 逐项记录 publication gate 的旧 severity → 新 severity。无 norm/文献不充分对可描述性私有发布不得再做形式性硬阻；无 runner、错误计分配置、来源权利、越界解释仍硬阻。未核对的具体门禁不提前宣称已降级。
- 第一份报告请求、候选集合冻结、独立解释和固定导出 manifest 须逐入口落实，不能因现有 snapshot/导出 worker 存在就宣称完成。

## V02 实施记录

新增 `measurement-content/release.ts` 与 repository：统一的三层精确身份、独立内容投影、不可变版本冲突、确定生命周期、来源/指标引用检查及有界目录投影。现有草稿工作区、scorer、runner 不变；本单元没有公开未授权 API。新增单一共享 release 表及 append-only 状态事件表，数据库 trigger 保护已发布内容/来源，未执行实际迁移。V03/V04 家族适配器仍须用既有 schema/runner/资产授权验证内容；V05 增补内容域能力并对齐管理员身份基座；V07 完成报告语义门禁。通用信封结构校验不是科学发布资格。

轻量检查：6 个新纯合同用例通过；新模块 strict TypeScript 检查通过；Prisma schema validate 通过。复用相邻官方依赖目录只读符号链接，未安装/复制大依赖。真实 PostgreSQL 迁移/并发/恢复与最终应用回归留 V10 集中执行，不能以本次 schema validate 代替。七轴表述已按既有 `server-version/docs/scale-library/catalog-version-semantics.md` 修正。

## V03 实施记录

Training 自编发布、Standard onboarding 发布及 Survey Wave 中的 Scale 编译产物已接同一 `measurement-content/scale.ts` 校验/投影/持久化事务。保留现有导入及编制 UI、`assertScaleCopyPublishSource`、只读目录来源和原媒体保留流程；不改 School/Teacher 菜单。私有发布无需目录批准或常模，导入与手工编制都通过同一已支持 ScaleDefinitionV2/runner 就绪检查。私有 key 由可信 scope 与稳定 draft/scale ID 派生，owner/project 不进入科学指纹。

新增 Scale 当前 release 指针和 Survey frozen unit 的精确 release/hash；旧运行字段暂时保留至 V08/V09 完成一次性切换，不宣称已移除双轨。新测量投影显式排除 report/reference/source/license，保留完整题目/响应/计分/质量/媒体协议；旧 definitionHash 不被改造为新身份。copySource/目录来源证据冻结到独立 provenance，不成为第二份当前授权。报告及参考独立发布/数值规则仍属 V06/V07，不在本单元声称完成。

修正 V02 review：参考/报告修正文案的内部发布用途区分 NEW_ADMINISTRATION 与 HISTORICAL_INTERPRETATION。后者可引用 SUPERSEDED/RETIRED 测量，仍拒 REVOKED；该参数不由前端直接控制，未来新投放仍要检查测量可用性。新增状态负例与 Scale 投影/跨项目同名/无参考/不支持参数合同，总计 11 个相关用例通过。新核心/适配器 strict TypeScript 与 Prisma schema validate 通过。实际发布接入点的扩展类型检查发现共享依赖中的旧 Prisma client 缺现有 Training 字段，且定向编译未加载 Request 全局扩展；本改动另发现的 Survey 返回类型 narrowing 已修正。未将该扩展检查标为通过，最终须使用本分支私有生成 client 集中验收。未执行数据库迁移、完整应用/浏览器回归或 CI。

V03 独审修复：Survey 的有效 presentationMode（省略时与现有 UI 一致为 ALL_AT_ONCE）进入 measurement canonical 投影；ONE_BY_ONE 与 ALL_AT_ONCE 即便题目/计分相同也不能同 hash。Training ScaleDefinition 没有独立可编辑 presentationMode，保持 RUNNER_DEFAULT 及既有 display.randomizeItems 不支持硬阻；后续投放协议仍由 V08 冻结。目录导入使用 sourceProvenance.source.sourceVersion，draftRevision 只表示私有编辑/发布序列，缺来源版本拒绝而不猜测。两项新负例单独通过。

## V04 实施记录

现有 Cognitive 注册 runner/configSchema/FINAL trial budget 与现有 SJT V1/V2/scorer 已接三层测量适配器。Cognitive 配置 publish 及 retire、Survey Cognitive/SJT Wave 冻结、SJT author release 发布分别在原业务事务中持久化精确 release；新增当前 config/author release 指针，Survey 继续保存逐 unit 的 release/hash。没有新增认知范式、SJT 编辑器、上传脚本或新计分器。

Cognitive 内容投影冻结实际配置、协议、输入/时序/随机策略、质量约束、指标、支持 profile 参数和 FINAL 上界，剔除 report 配置；不认识的参数/runner 拒绝。SJT 评分矩阵/专家 key 保留在测量层，report/referencePolicy 剔除；线上原始响应协议/题面显式冻结，先验证既有 online 元数据，再去除旧全定义摘要和版权/作者备注。Survey 目录 SJT 保留来源 instrumentVersion，私有 edit revision 单独作为 release 版本。

Cognitive 原发布入口此前没有 actor 参数；现在 controller 使用已验证请求身份，CLI apply 必须显式提供真实既存 `--actor` 并在事务中校验当前系统管理员。无 actor 拒绝，不补造身份；V05 将由本 PR 内容域能力取代宽泛管理资格，系统强认证对齐管理员最终接口。现有生命周期测试已同步，真实 PG 测试使用独立合成 publisher，不把普通教师自动升权。

验证：新增 4 项 Cognitive/SJT 合同通过；受影响 release service 的 7 项单元通过；本分支 Prisma schema validate 通过。首轮新 fixture 缺 SJT 必需第二题及认知测试开关，修正测试输入后通过，未放宽产品校验。私有 Prisma client 已从本分支 schema 成功生成（独立 dependency overlay，仅复制约 8 MB client，其他官方依赖只读软链，生成物约几十 MB），没有覆盖共享依赖。加载真实 Request 扩展后，V02–V04 新核心与实际发布接入点定向 strict TypeScript 检查通过，解决此前旧生成 client 导致的检查阻塞。真实 PostgreSQL 迁移/事务/恢复和浏览器回归尚未执行，留集中验收；schema validate 和 mock 单元不替代这些证据。独立报告/参考、投放消费和旧结果回读仍须 V06–V09 完成，不将本单元登记为整个闭环上线。

### V04 review correction and V06 internal preparation

V04 共享 Cognitive adapter 不读取 Training admission 开关；各入口仍执行自己的准入门禁。精确已注册 runner、受支持参数和 fake fixture 禁止保留。新增关闭 Training 开关时 Survey 编译仍可执行的合同，5 项 adapter 测试通过。

V06 当前仅准备内部候选/审阅 DTO 与纯函数，尚无公开接口：冻结授权来源事实 ID/version、测量身份、方法证据及候选 hash；拒绝重复/失权样本、错误样本数、非有限估计、不可计算的分布估计、私有样本自动提升正式 norm；正式跨入口 norm 拒绝分析者自审。ReferenceCore 增加 SJT 显式 instrumentType，没有以 Scale 冒充。4 项内部合同通过，定向 strict TypeScript 通过。

此阶段不等于 V06 完成：实际 scoped sample reader、持久化候选/审阅及数据库独立复核约束、能力接入、撤回与逐指标选择仍待实施；现有治理固定经验样本门槛尚未替换。理论/准则规则不能强塞进经验样本候选。存储与冗余持续记录见 [resource-ledger.md](resource-ledger.md)，未测项保持显式待验收。

V07 内部准备：REPORT template 现使用严格展示节点合同（文字、指标引用、已解析参考 band key 的文案、冻结资产引用、简单图表），拒绝未知字段及嵌套评分/阈值/常模表/脚本；引用指标和资产必须在发布声明中。报告生成器只能从冻结事实/参考结果取值，不执行文案或自定义表达式。新增 3 项负例/引用测试，加既有 release 合同共 10 项通过，定向 strict TypeScript 通过。此为发布信封门禁；草稿/预览服务、既有报告迁移适配、显式新解释持久化/幂等和当前权限检查尚未接通，不宣称 V07 完成。

V06 后续内部准备：经验治理去掉固定总 N/每段 N 门槛，允许无经验分段；保留精确样本分配、正有效样本、分布/SD 最低可计算性、finite、来源和质量校验。方法充分性/适用性仍需候选证据与授权审阅，少量描述样本不等于正式 norm。新增不可变候选/审核表的追加迁移及内部事务助手，候选检查实际测量 release 身份与指标，审核绑定候选 hash；数据库 trigger 从候选内容派生正式跨入口用途，拒绝计算者自审，actor FK 必须对应真实 users。新增治理 3 项 + 候选 4 项测试通过，Prisma schema validate、定向 strict TypeScript 通过。未执行真实 PostgreSQL 迁移/trigger 测试；未接审核发布服务和能力授权，因此不声称数据库行为已经验收或 V06 完成。

内部合同独审修正：候选现按稳定 entryKey（指标/参考种类/人口条件/测量评分版本）冻结实际成员，可信 scoped reader 需提供每事实的真实 measurementReleaseId、metricKeys、eligibleEntryKeys；输入自报字段必须一致。互斥年龄组各 50 的总批 100 复现已覆盖：正确 50/50 通过，错误整批 100/100 与跨组伪造拒绝。实际测量三项身份由候选 repository 的一次可信 release 读取校验。报告 REFERENCE_BAND 增加 referenceKind，避免同指标 norm/criterion 同名 high 混淆，模板不固定具体 norm 版本。相关 9 项纯合同通过，strict TypeScript 通过；均为尚未暴露 API 的阶段合同修复，不表示既有用户已受影响。

V06 内部审核发布助手从数据库读取指定 candidate/review，不接受客户端 approval JSON；重新验证当前 scoped reader 的样本资格后构造 scope 派生 key，再交共享发布事务。真实服务仍必须从 authenticated actor 与当前授权派生 actor/authorizedFacts，不能将请求 body 直接传入这些信任参数。新增 repository 合同验证实际 scoring identity 不符拒绝、失权拒绝及数据库 REJECTED 不发布。entryKey 现每 entry 只 canonical/hash 一次，样本循环复用 key；调用次数合同覆盖，未扩算法或做性能实验。相关 8 项纯/mock 合同通过，真实数据库验收仍待集中运行。

V06/V08 冻结匹配内部准备：新增有界 EXACT_POPULATION_PRIORITY_V1 选择器，只接受已冻结的精确 release/hash/entry 集合及显式 priority，复用 ReferenceCore 人口匹配。相同 metric/referenceKind 的同优先级多匹配降为 AMBIGUOUS；缺人口字段只可回退到集合中真正适用的条目，不按“总体”名字猜测。已冻结集合正常 SUPERSEDED 仍可选；REVOKED slot 降级、RETIRED 不新增选择。结果仅保存精确引用及不可用原因，不复制参考统计、扫描样本、取 latest 或调用 scorer。3 项匹配合同及定向 strict TypeScript 通过。实际投放/Wave 冻结写入与 START 调用仍待 V05 接口稳定后的服务接入，不能将此纯函数当作完成的 V08。

集中数据库部分验收见 [20261020-validation.md](evidence/20261020-validation.md)：隔离 PG16.15 single-user 实际执行182份 SQL迁移和16项数据库拒绝合同，另验证2种合法审核。socket/Prisma deploy/并发等未覆盖项明确保留，不把本次证据扩大为完整上线验收。

### V05/V08 接入待办（当前接口阻塞，暂停新增准备层）

真实 reader 只读盘点见 [reader-interface-audit.md](reader-interface-audit.md)。

- [ ] 本 PR 内容域 capability 与现有 Training resource scope / Survey project owner scope 取交集；系统签发入口待管理员 principal / 近期强认证对齐；底层 facts reader 不独立授予访问。
- [ ] 从真实 publication/runtime release 绑定补入 source 投影，拒绝客户端自报 measurementReleaseId；历史没有无损映射时单列，不编造同一测量身份。
- [ ] Survey 人口组仅使用明确映射的真实冻结字段；现阶段不从题名推断、不自动映射、不新增人口资料采集。缺字段只匹配真正适用的已批准无约束参考。
- [ ] Training 复用已校验 frozen context、sourceResultHash、epoch/slot 与现有有界 facts batch；保留关系测评可见范围及组织资源隔离。
- [ ] 候选实际 membership reader 保留 Survey 计算前后 sourceRevision/count/撤回 fence，发布事务重核当前资格；不要把这些具有 TOCTOU 风险的检查当作冗余删除。
- [ ] 原报告按原冻结工件读取，不重跑当前选择器；选择器任一候选 REVOKED 导致整 metric/referenceKind slot 降级的保守策略须在接入中显式保留。

## V05 内容授权与 V07 私有报告服务接入

- `ContentCapabilityGrant` 复用现有 User，能力限定 measurement/reference/report/catalog/material 操作及精确 product/scope/resourceKeys。根授权最多委派一层；子级不能扩范围、能力或期限，不能再委派。每次授权一次有界祖先查询加共享锁，取得锁后读取数据库时钟；撤权 CAS 与保护写入同锁协议，父撤权无需复制更新所有子行。授权元数据不进 measurementHash。系统根授权签发与紧急撤销 HTTP 仍待 PR317 真实近期强认证接口接入；本次未暴露临时系统授权路由。
- Survey `/api/survey/projects/:pid/report-drafts` 提供创建、分页列表、读取、CAS 编辑、合成预览与发布；`/measurements` 仅列本项目已有原生私有测量身份和指标。用户来自 authenticateSurvey，事务复用既有项目 owner、有效 Survey researcher grant、账户与 MFA enabled 校验。MFA enabled 不等于近期强认证；此私有作者流程不授予系统管理或正式 norm 权。
- 草稿精确绑定现有 measurement release；当前只允许本项目原生内容。目录使用许可不自动允许改编报告。静态图片沿现有项目资产所有权、冻结哈希/MIME、体积和权利声明验证；发布后保留引用。作者自用报告无需平台上架审批，发布只记录作者与 publicationNote，不伪造平台审核。
- 已发布草稿不可变；修改应创建新的 reportKey/version，旧版本不覆盖。报告模板共享存储一次，声明式渲染器只消费已给定事实/参考结果，不计分、不重算阈值、不执行 HTML/脚本。无效/非有限指标不生成参考解释；同指标相同 band 名按 referenceKind 精确区分。
- 预览明确标为 synthetic，只有服务端固定的可解释/无参考/无效情境，不读取真实样本。报告编制可用于已结束或归档项目的历史解释，不能重开采集；正常 superseded/retired 测量允许修正文案，REVOKED 拒绝。用途由服务端确定，前端没有 historical 绕过参数；后续新施测绑定仍单独检查测量可用性。
- 当前是实际受控后端服务，不代表四入口 UI、真实答卷报告生成、显式新解释持久化、wave/report 绑定或 V08 START/FINAL 已完成。已有测量来自 Wave 发布；独立编制与投放选择的完整 UI/顺序仍在 V07/V08 清单内。V06 正式参考仍必须细粒度内容能力与真实数据范围同时满足，项目 owner 不自动成为分析者/复核者。

### 私有报告授权与输入收口

Survey 项目授权把原有 owner/账户/grant/MFA 的 FOR SHARE 行集合放入 MATERIALIZED CTE，外层取 clock_timestamp 后再核账户 expiry，避免锁等待跨过到期时间仍获准；不新增一轮账户查询。模拟锁后时刻的合同已验证，真实双连接等待/撤销仍待获准连接环境。

私有 reportKey 上限 168 字符，与服务端 `report:`＋scope SHA＋分隔符的 72 字符前缀共同满足 release key 的 240 字符合同。模板指标/资产未知绑定使用专用错误类型返回受控 400；未知服务故障继续进入原 500 处理。

### 原生测量可先发布，再编制报告

新增 `POST /api/survey/projects/:pid/instruments/:iid/measurement-release`，只接受精确 `revision`。沿真实项目 owner/grant/MFA 和草稿共享锁检查 revision/status，复用现有 Scale/Cognitive/SJT 编译器、发布适配器与项目图片许可；普通 FORM 和目录来源草稿不走该原生作者入口。返回只含 release 身份、hash、版本与指标键，不含题目评分 key 或可执行定义。相同草稿 revision 重试复用不可变 release，资产引用同事务保留，停止可用的旧 revision 不能被重试重新激活。

此步解除“先投放才能编报告”的依赖；Wave 的既有发布调用暂共享相同适配函数。V08 仍需把 Wave 改为仅冻结显式选择的精确已发布测量/参考策略候选/report，并清除该隐式发布路径。该切换尚未在本步骤声称完成。

### Survey 私有报告编制界面

项目工作区新增“私有报告”页签。首次打开才读取报告与测量列表，切换页签保留未保存编辑。界面提供原生测量显式发布（按需加载）、报告草稿创建、受控 TEXT/METRIC/REFERENCE_BAND 编辑、保存、三个明确标记的合成预览、带说明的显式发布与已发布版复制为新版本。非当前编辑器支持的 CHART/ASSET 区块和资产清单读取后原样保留，不能用 JSON 编辑器改数值规则。CLOSED/ARCHIVED 只允许历史报告编制，不能发布新测量或重新采集。

创建响应不确定时保留原 requestId/内容，重试不自动换新请求。列表刷新失败与已成功写入分别提示，不要求重新发布。参考 band key 仍需作者引用已批准规则；合成预览明确不证明真实参考存在/适用。实际 wave/report 绑定、被试消费及独立解释结果持久化仍归 V08，未由此 UI 提前完成。

验证：前端专用 10 项、工作区导航/请求 21 项、入口相关 14 项通过；定向 strict TypeScript 与五个变更前端文件 ESLint 通过。未运行全量 build、真实浏览器、最终 CI。

### 报告工作区离开保护

报告面板向父工作区报告 dirty/pending/busy。跨项目“查看/编辑”、新建其他项目及主动登出/改密导致离开时统一检查：未保存文案需要明确确认放弃；写入处理中或创建结果不确定时禁止切换，先回报告面板核对/重试原 requestId，不能卸载后悄悄换请求。浏览器离开使用 beforeunload 提示；未把报告草稿或敏感内容额外复制到持久化浏览器存储。

真实 SurveyApp＋SurveyReportStudio 组件合同验证取消保留、确认离开、busy/pending 阻止跨项目/新建，以及不确定创建重试的完整请求身份不变。两前端定向套件 33 项通过，相关文件 ESLint 与真实 App 依赖图 strict TypeScript 通过；不是浏览器端到端测试。

## V06 真实 Survey 描述性候选创建服务

`survey/reference-candidates.service.ts` 现将真实 source reader 接到候选持久化。范围严格为一个项目、一个波次、一个原生测量指标、最多 250 份 FINAL（资源界限，不是统计充分性门槛），仅创建私有 descriptive_sample/local_pilot。请求只含来源选择、版本与方法说明；均值/样本标准差、人口描述、measurement 身份、样本 manifest、factVersion 和分析者均由服务端派生，不接受外来 norm/statistics/population JSON。

1. 短事务核当前 owner/Survey grant/MFA，读取真实冻结测量指针，再核精确 PROJECT/reference/measurementReleaseId 的 `reference.analyze`。项目 owner、入口 ADMIN 或 MaterialGrant 都不自动替代该能力。
2. 事务外调用既有 `loadSurveySource(selectScore,selectRaw:false)`，保留其源头/末尾 fence 和有界解密；不在外长事务内再占第二数据库连接。源身份须与已验证 frozen sourceVersions 对上。
3. 同一纳入集合用于既有 describeWave 和 manifest：Cognitive metric 为 OK、Scale/SJT 为 calculated，且真实已冻结 quality 为 interpretable。Scale 现在透传原本已存在但未投影的 privateScoring status/quality；不新增质量阈值、不重计分。无质量证据、limited、invalid、未可计算、缺失值按互斥优先级计数，聚合计数返回并写入候选局限，不暴露被排除者身份。n=1 不填不可估计 SD；零变异单独说明，不伪装常模。
4. 短写事务重新核当前 owner/capability、精确 binding 与项目 revision、同 cutoff/wave/filter 的整批 FINAL count，再调用已有 storeReferenceCandidate。质量审核及两类撤回的既有先锁项目/递增 revision 协议保留。此处冻结明确 manifest，不声称包含尚未提交的 FINAL。

候选新增可信 `sourceBinding`（wave/variable/revision/count/cutoff）供下一步复核与发布精确重读；其内容进入 candidateHash。尚无此服务的 HTTP 或系统根授权签发入口；当前不把此内部服务称作用户可用正式 norm 工作台。正式跨入口 norm 仍须独立复核，人口分层必须来自明确版本化字段映射。

验证：新服务＋候选＋真实 reader 合同共 38 项、定向 strict TypeScript 通过。尚未运行真实 PostgreSQL 并发或应用 HTTP；未改迁移、未跑全链或压测。

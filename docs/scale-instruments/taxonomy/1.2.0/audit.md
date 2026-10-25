# 本轮新增量表标签一致性只读审计

## 结论

**当前内容标签 GO；多轴筛选消费者仍需下一相关 PR 完成。** 未发现本轮标签导致错误非商业许可宣称、虚贴 ACT/CBT/DBT、将工作译稿冒称已验证中文等内容阻断。本文不是全库审计、正式上线批准或数据库导入证明。

- 审计时间：2026-10-25 UTC。
- 固定提交：`09450a350326ab520795dc6c2953341f0946187e`。
- 对比基线：`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`。
- 范围：两提交间新增的 **35 份 source.json**，包括此前 34 份新增与 ORVIS 候选；不含之后新加入的 PBA，不把英文既有条目或目录候选计入。
- 文件根：`server-version/backend/src/modules/scale/instruments/`。
- 真实标签字段：`$.catalog.construct.constructOverlapTags`，不是 `catalog.tags`。
- 状态：`DOCS_ONLY_PROPOSAL`。本文及字典提案不改变 source、目录版本、C/P/R、本地化、快照或运行时筛选。

## 覆盖与通过项

1. 35 包共使用 113 个不同命名空间标签、103 个不同自由辅助标签。所有有前缀标签均在既定八轴内，没有新增第九轴，没有仅大小写不同的 ID 碰撞或包内重复 tag。自由辅助标签不是受控字典违规。
2. 已声明的 response 标签均与当前 administrationModes 相容；本审计不要求每包将所有允许模式重复为标签。
3. ASKU、SCI、DJGLS、L1 均有精确 `非商业` 及 `license:noncommercial`，usageRequirements 仅允许 NON_COMMERCIAL。L1 的 SA 要求在许可文本中完整，缺通用 SA tag 是检索属性问题，不是漏写授权条件。
4. 唯一 `orientation:ACT` 是 C-SACS；其余本轮工具（包括 IPIP）没有无依据的 ACT/CBT/DBT 标签。取向轴可以为空。
5. C-SACS 明确源中文大学生证据与平台数字呈现待审的区别，当前范围是成年大学生。K6 使用作者托管中文标签且保留本地验证/呈现待审，不冒称公共领域或自创工作译稿。其他工作译稿没有冒称已验证中文。
6. SSWQ 6–8 年级、SAS-SV 八年级及成人工具的标签与各自目录范围一致。MWQ 的 `adolescent_source_evidence_only` 仅为原版样本证据，不应被未来消费者理解为中文版未成年人准入。
7. 15 个 manifest 2 的标签与 `docs/scale-instruments/taxonomy/catalog-revision-2/applied-source-mapping.json` 中 newTags 逐项相等，旧辅助标签全部保留；另外 20 个新增 source 是 manifest 1。
8. `onboarding/axis-snapshots.ts` 的 safeSource 保留完整 source，仅将 scorer 插件转换为 key/version；catalogManifestVersion 进入 axisHash。同目录身份不同源会冲突，不会无声覆盖。这里只审静态机制及 source；没有查询数据库历史快照。
9. `onboarding/materialize.ts` 仍只向 Scale.tags 投影 primaryDomain。完整 sourceSnapshot 与 UI 多轴可筛选是两件事，不能因本次 GO 宣称后者完成。

## 需要下一相关 PR 解释的检索问题

以下路径均为 `<文件根>/<key>/1.0.0/source.json`，除另注外，字段均为 `$.catalog.construct.constructOverlapTags`。不要求直接替换任何已冻结值。

| key / 文档 | 现值或缺项 | 证据及建议 | 影响 |
|---|---|---|---|
| sas_sv10_zh_cn_research | domain:digital_behavior | 1.1 字典与 1.0 的 domain:digital_lifestyle 中文 label 均为“数字使用与生活行为”；唯一明确同义 alias 提案，保留两 ID | 精确领域筛选分裂 |
| l1_zh_cn_research | domain:well_being | life_satisfaction 构念；建议 broader 指向 wellbeing_strength，非完全同义替换 | 幸福感大类漏项 |
| srq63_brown_miller_zh_cn_research | domain:self_regulation | behavioral_self_regulation；建议 broader 指向 selfreg_executive，不能把自调节等同执行功能 | 自调节大类漏项 |
| mslq_critical_thinking5_zh_cn_research | domain:learning_self_management | 目录是特定课程批判性思考策略；与 motivation_learning 先记 related，层级留下一 PR | 学习领域漏项或误合并 |
| cbi_zh_cn、hse_msit_zh_cn、tswq_zh_cn | domain:teacher_workplace | 与 stress_work 交叉，尤其教师幸福感不是职业压力的同义词；related 提案 | 工作场域跨域搜索需解释 |
| l1_zh_cn_research | license:cc_by_nc_sa_4_0，未含 license:share_alike | usageRequirements.notes 明示相同方式共享；ASKU 已有通用 SA tag。建议许可属性映射 | 按 share_alike 精确筛选遗漏 L1 |
| mslq_critical_thinking5_zh_cn_research | use:course_research，无 use:research | catalog.intendedUse 含 RESEARCH；建议用途父级映射并保留课程限定 | 研究大类筛选遗漏 |
| srq63_brown_miller_zh_cn_research | use:professional_research，无 use:research | catalog.intendedUse 仅 RESEARCH；requiredTraining 与非自诊/专业研究说明须保留 | 研究大类筛选遗漏，不能靠抹掉限定解决 |

其他宽窄关系（adult / adult_research / adult_college_research / adult_university_student、ogl / ogl_3_0 等）见 JSON。broader 的 target 是建议父级或许可属性，不是将施测权限向更大人群扩展。source-evidence 人群标签只用于证据检索，不能承担准入功能。

## 字典扩展提案

`dictionary-extension-proposal.json` 提供 **61 个已在上述固定提交实际出现、但未被 1.0 + 1.1 字典登记的 ID**：

- construct：36
- domain：7
- population：6
- license：5
- language_validation：4
- use：3

这不是 61 个错误。新构念不能因为不在原 99 词表中而被拒绝。每项包括原 ID、namespace/axis、建议中文 label、实际 source 路径、精确标签数组 JSONPath、supportingJsonPath 与原字段值。中文 label 是检索展示释义，不声称是作者验证译名。全部 35 包的原标签与 manifest 列在 auditedSources，便于独立复核。

当前文档位置：`docs/scale-instruments/taxonomy/1.2.0/dictionary-extension-proposal.json`，明确 DOCS_ONLY_PROPOSAL。不实现 runtime 解析，不改任何冻结标签。若未来确需增补 source 标签，单独依据 manifest 元数据版本机制执行，不能借字典登记静默覆盖 source。

原 1.0 的 72 项全库映射仍是基线提案；本报告没有把其全部称为已应用，也没有把 registry 条目数等同独立构念或 DB 量表数。

## PBA 独立补充范围

`pba-supplement-proposal.json` 另登记 8 个 PBA 标签，证据锁定 `18263dd1440709d7cf1391949a0056bf1825a989`；不扩大上面的 35 包 / 61 项审计范围。PBA 随后仅修订通用报告的条件式措辞，标签与本补充证据不变。补充文件中的 sourceSha256 是该历史候选的哈希，不是最终执行包哈希。

两个 JSON 均为 `DOCS_ONLY_PROPOSAL`：alias / broader / related 关系尚未应用，没有新增筛选消费者，没有迁移任何源标签或修改目录版本。`validation.json` 仅记录文档结构、引用和原值核验，不是量表测试或上线验收。

# 三原则与当前实现的有限差异清单

依据：用户确认的三个原则。核对范围：内容分支起点7330038及main ff8471e5。本文件是可实施的功能待办，不是新增发布门禁；本批没有修改以下引擎。

| 问题 | 已核对的代码与现状 | 后续最小改动及检查 |
|---|---|---|
| 无ReferenceSet时没有独立参数版本 | onboarding/axis-snapshots.ts冻结instrument、scoring、report、references、localization和catalog，但score_only没有独立参数版本；批次工具明确返回null | 为原始分数解释/经验预设/实证参数提供同一参数快照身份；参数单独更新不改变测量和报告；旧结果绑定旧参数 |
| 翻译状态被直接用作激活阻碍 | policy/localization.ts对reviewStatus和expertReviewStatus生成阻碍；onboarding/install.ts消费这些原因 | 按三原则区分语言版本一致性与审核进展提示；真实题义错误仍在内容层修复；不得伪造COMPLETED来绕过现有行为 |
| 实际参数与辅助reference混用 | STANDARD的原始分数反馈存在限制；报告中的reference解释依赖声明的ReferenceSet；仅有文献档案不应建立运行依赖 | 允许有明确依据的经验预设参数独立发布、标明性质，报告只消费绑定参数，不强求实证常模 |
| 一个旧报告入口无条件读取references | 内容分支scale-workflow.service.ts的buildScaleResultForRecord直接await loadScaleReferenceSets；main同名路径也如此 | 对none策略跳过读取；有参数时仅按冻结版本加载；定向测试监测查询调用，不能靠文档声称零查询 |
| 统一交卷路径已有条件加载 | unified-final-submit.service.ts只在snapshot.referenceBindings非空时loadFrozenReferenceSets | 保留已有短路；验证none策略不查询、绑定参数只读精确版本，避免重复“优化”已正确路径 |
| 草稿物化与正式安装/激活是不同动作 | materializeScaleInstrumentContent支持DRAFT/HIDDEN；installScaleInstrument还会执行激活前检查 | 批次工具复用物化，不假称激活成功；正式发布改造单独固定范围 |
| 同一scale.code目前只容纳一个当前instrumentVersion | materialize.ts遇到不同instrumentVersion抛DEPLOYMENT_VERSION_CONFLICT | 本批明确名单不同时选两个同名版本；已有数据库的内容升级需沿现有冻结/替换流程另行验证，不能覆盖旧结果 |
| 独立指导语只存在研究文档 | 当前两包的施测说明未有真实UI呈现证据 | 在现有显示能力中确认独立指导语；缺失能力单列功能修复，不能拼进第一题 |
| registry启动时会验证全部源与golden | instrument-registry.ts在模块初始化逐源parse和validate | 扩容后测量启动成本，必要时把开发验证移到构建阶段；这不是已实测的并发瓶颈结论 |

相对路径均位于server-version/backend/src/modules/scale，reference-binding位于assessment-runtime。没有读取生产数据，没有压测，也没有修改PR356、共享过滤器、权限或数据库schema。代码中存在查询不等于每条用户流程都会走到该入口；全链路查询次数仍需对应执行证据。

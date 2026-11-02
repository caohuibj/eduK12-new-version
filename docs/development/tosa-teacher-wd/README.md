# TOSA 教师担责 · 完整工具 0.4.2

本 PR 安装一个自包含、可运行的教师情景测试候选：15个独立故事、48个可能节点、完整路径42轮行动、每轮两个可选追问。原生分支、计分和反馈均在 instrument.json 中可审查；76个组合 goldenCases 覆盖全部节点和边，不声称穷举所有跨故事组合。

当前技术状态 **DRAFT**，科研成熟度 **PILOT**。本 PR 不创建生产数据库记录、不合并、不部署、不取得生产凭据。通过技术检查不等于经过校准，正式工具库可以发布明确标注的试用工具，但必须走现有独立审阅和管理员发布流程。

| 身份 | 冻结值 |
| --- | --- |
| instrumentKey / instrumentVersion | tosa-teacher-wd-full / 0.4.2 |
| schema / flow | Situational V2 / BRANCHING_DAG_V1 |
| respondentType | teacher_self_report |
| scorer | AUTHOR_KEY_SUM@1 |
| scoringVersion | tosa-observable-0.4.1 |
| reportVersion | tosa-formative-0.4.2 |
| definitionHash | 1eed4542e585f9b8aa3a37ac78da29ef61163b16d5f3d98b4acc6bce9fe5935e |
| compiledRuntimeHash | e52d2535dbf8ee8cbe1dc3332aa6eedd852129b661d9654f260417e04d126dbd |
| publicationContentDigest | 2e164231c0f77c7483f9c23dc8235b84a27704b3906c3ef344a1bbe94a805aec |
| 适配基线 | adad907a4b68606ce71bb1a4f2d7c511c872c715（提交前再次核对远端 main） |

五项交付：

1. [修订说明](revision-notes.md)保留版本选源及51项修改理由；原生题本保留教师的时间、权限、资源、收益代价和合理退出。
2. [教师指导语](participant-guide.md)及[逐题字典](question-codebook.md)区分现实最可能行动 WD、可选追问及缺失；SHOULD需另冻版本，不混计。
3. [计分与分析](scoring-and-analysis.md)、[逐选项动作键](action-key.md)、[构念机会](construct-mapping.md)给出指标定义、方向、分母、缺失和计算例子。212个指标按母情境独立，含15个完整性计数；没有心理能力总分、反向人格分或跨工具合成分。
4. [反馈与练习](feedback-and-practice.md)包含11类行为练习和15项情境迁移任务；实际报告按选择轨迹生成，不把训练方法宣称为已验证干预。
5. [发布清单](release-checklist.md)及[定向验证证据](../../evidence/tosa-teacher-wd-042/verification-check.json)对应现有注册、权限与工具库机制，无新引擎。

## 来源和授权范围

原题本及历史稿继续留在原私有资料目录，本 PR 不附原文档、私有链接、真实用户记录或原始敏感日志。本轮题目为原作者内容的明确选源和 AI 辅助原创修订；理论文献是概念依据，未复制其完整测量题项或计分键。[算法手册](scoring-and-analysis.md)列明已核实摘要、全文未核实及证据不能外推之处。

冻结内容中的 license.note 保留形成时“仅原私有资料目录内审阅”的历史文字，避免改写已验证定义及版本哈希。用户随后明确授权“两个 situation judgment test 先推送到 GitHub 吧”，并授权“按照正式的发布做一轮检测 然后进入工具库”；本说明记录对**本轮项目候选提交及项目工具库使用**的后续授权。redistribution 继续为 restricted，不把此授权解释为开源许可、第三方题库再分发许可或题库所有权证明。发布管理员应记录这一范围，外部再发布仍需另核授权。

## 当前可见范围

DRAFT仅供项目审阅与隔离开发，普通参与者不可新开测。原生库加载源但不会将它选成已发布工具。完成清单后可面向教师试用；不能声称“所有四入口均可供所有角色作答”。具体四入口适用范围见发布清单。历史已完成结果沿用其冻结快照，新内容不覆盖旧版。

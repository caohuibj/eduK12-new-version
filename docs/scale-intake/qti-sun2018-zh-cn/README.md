# QTI中文Sun2018｜两份项目无计分表单｜初中7–9年级｜学生填写

本次仅交付完整的课堂观察记录（40题）和施测背景（3题）两份 FormDefinitionV2，无分值、量表版本、评分参数或评分报告。相同表单已完成隔离导入验证；临时库已销毁，正式开发库及生产库均未安装。原QTI五点中文版的精确指导语、中间选项和编码仍缺，不推进该版本，不注册九个原量表目录候选。

## 来源与许可

Sun, X., Mainhard, T., & Wubbels, T. (2018; online 2017). Development and evaluation of a Chinese version of the Questionnaire on Teacher Interaction (QTI). Learning Environments Research, 21, 1–17. [官方全文](https://doi.org/10.1007/s10984-017-9243-z)。表4中文40条陈述全部转录，印刷页14–16；文章为CC BY 4.0，保留[署名与适配说明](THIRD_PARTY_LICENSE.md)。许可仅按该文章实际范围适用，不扩展到其他QTI版本或另署权材料。

观察表保留中文陈述和共同题干，增加项目ID、冻结跨维混排序列和自拟观察选项。“我观察到过／我暂未观察到／我不确定或不便回答”不是原版频率锚点，不代表QTI效度或计分。背景表为项目原创。两表均可跳过，不收集真实姓名；可见范围依实际既有配置，不承诺未经配置的匿名性。

## 可导入内容

| 项目ID（内容1.0.0） | 定义 | 题数 |
|---|---|---:|
| qti_sun2018_observation_form_zh_cn | observation-form.native.json | 40 |
| qti_sun2018_context_form_zh_cn | context-form.native.json | 3 |

[form-manifest.json](form-manifest.json)含说明、来源、普通组合清单和固定题序；[CSV](observation-form-import-csv.txt)用于现有导入器。组合为背景与完整观察表，共43项FORM，无SCALE，不算八维、Agency、Communion或总分。[item-preparation.json](item-preparation.json)的研究映射仅供来源核对，不等于独立短表获验证。

## 反馈与接收者

学生只得到“已记录你愿意提供的课堂观察，此表不计分”的确认。正常观察、较低体验和证据不足均不从选择强造体验分析；可提示自愿向可信成人表达学习需要，不要求学生对抗教师或承担不当对待责任。教师仅按已有授权、匿名、发布和最小人数条件获取允许的汇总；不新增个体意见访问权。不使用原量表的假设评分报告草稿。

## 验证及后续

[隔离回执](isolated-form-import-receipt.json)与[native-form-validation.json](native-form-validation.json)为此前相同表单输入的历史证据：私有DRAFT模板40/3题、组合43项回读通过，0评分选项、COLLECTION_ONLY；回环PostgreSQL16.15按schema db push，非迁移链证明。旧Node24.19低于当前声明，保留局限，不改写为当前环境或正式开发库安装。当前合同检查见[current-form-contract.json](current-form-contract.json)，不重复隔离导库。

[verification.json](verification.json)、[scoring-preparation.json](scoring-preparation.json)、[report-examples.json](report-examples.json)保留前期审阅历史；九个目录、假设计分及六份未来评分报告不属于当前可执行交付。未修改运行逻辑、权限或发布规则。

管理员在目标环境按作者、来源、题项和版本排重，重合则引用既有，通过现有表单导入、普通组合和审核流程安装。生产及管理员自建条目未核，不能宣称生产无重复。合入main不等于生产发布，不部署、不写生产库。

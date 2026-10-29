# AEQ 考试焦虑分量表｜来源与升级路径（catalog-only）

## 为什么登记为 catalog-only

AEQ（Achievement Emotions Questionnaire，Pekrun et al.）是引用量最高的学业情绪工具（2011 原文约 3,700+），其考试焦虑分量表是本分支第一批的优先目标。但官方题文载体在本轮登记时均不可用：

| 载体 | 状态 |
|---|---|
| 2022 AEQ-R User's Manual（作者自存档，University of Essex repository，公开全文） | 本环境直连/代理均超时（repository.essex.ac.uk 不可达），Wayback 亦不可达 |
| 2005 AEQ Manual（ResearchGate 作者附件） | 需登录 ResearchGate |
| AEQ 2011 论文附录（CEP, Elsevier） | 订阅墙内；KOPS 镜像需登录 |
| Scribd 转传件 | 用户上传，按库规不作再分发依据 |

按库规：**没有可达的官方题文，就不誊录题文**。本登记只冻结 catalog 元数据、报告设计与 blocker，不创建可执行。

## 授权现状

作者实验室长期惯例为"研究用途免费、引用并回传结果"，但**正式条款未归档确认**，登记为 `license: research_use_convention_unconfirmed`。AEQ-ES（小学数学版）由 Motivation Science Lab 官网直接提供下载（无附加条款文字），可作为后续洽谈参考。

## 升级路径（按 TSEC-22 先例）

1. 库负责人或集成方从 Essex 仓库取得 AEQ-R 2022 手册 PDF（或作者页直链/邮件分发件），归档凭证。
2. 核对手册使用条款并归档 → 确定目标精确版本（AEQ 原版考试焦虑 17 题 / AEQ-R 对应版 / AEQ-ES 小学版）。
3. 逐字誊录题文与官方计分键，立 `1.0.0` 可执行 DRAFT：4 组 golden cases、complete_required、zh 反馈、独立提交、`[skip ci]`。
4. 中文译题另立版本，翻译验证完成前不标"已验证中文"。

## 证据要点

- Pekrun et al. (2011), CEP 36(1):36–48, doi:10.1016/j.cedpsych.2010.10.002（结构效度，多样本）。
- 与库内 `value_cost_*`、`academic_self_efficacy_*` 同属控制-价值理论框架：前因为动机信念，AEQ 测情境情绪——dedup 关系已写入 `dedup.json`。
- 题数 17 为文献通引口径，誊录时以官方手册逐题核对。

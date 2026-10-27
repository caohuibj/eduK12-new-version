# CFQ-7 认知融合问卷（7题）— 中文工作译稿

原作者：Gillanders, D. T., Bolderston, H., Bond, F. W., Dempster, M., Flaxman, P. E., Campbell, L., Kerr, S., Tansey, L., Noel, P., Ferenbach, C., Masley, S., Roach, L., Lloyd, J., May, L., Clarke, S., & Remington, B.（2014）
出处：*Behavior Therapy*, 45(1), 83–101 · DOI: 10.1016/j.beth.2013.09.001
平台身份：`cfq7_zh_cn_research@1.0.0`（第 62 个新增来源版本，第 58 个工具身份）

## 版本层

| 层 | 版本 | 实际运行身份 |
| --- | --- | --- |
| 题文／计分／本地化 | instrument1.0.0 / scoring1.0.0 / localization1.0.0 | 已创建，7题固定顺序，单一总分 7–49 |
| 参数 | score_only，无阈值 | ReferenceSet 未创建；`referencePolicy.type = none` |
| 报告 | report1.0.0 | score_only，无 bands、无标签；样例经真实 `buildScaleResult` 生成 |
| 目录标签 | 八轴 | 已写入 source，含授权风险标签；实际检索索引 NOTRUN |

## 授权状态：待授权（按项目政策记录，不是已获授权）

ACBS 页面许可原文（2026-09-15 更新）：

> The CFQ is free to use for non-commercial educational, clinical and research purposes, permission is not needed.

- 该声明**限非商业**用途；商业使用未获授权。
- ACBS 列出已有 Chinese 译本，并请拟译者先联系 David Gillanders；本平台不主动联系作者，列为**待联系作者**事项。
- 按项目政策（2026-10-27），授权不作为入库门禁，但记录为
  `license:authorization_pending` + `license:author_contact_pending` + `license:risk_noted`；
  `definition.license.status` 为 `unknown`，**不伪造为 verified**。

## 题本载体与核对

七题英文原文经四个独立载体交叉核对完全一致：
APPI 官方 PDF、MDPI *Life* 13:803、*Open Psychology Journal* 马来版验证附录、psytests.org.ru。
逐题对照见 [bilingual-content.json](bilingual-content.json)；归属与限制见 [THIRD_PARTY_LICENSE.md](THIRD_PARTY_LICENSE.md)。

## 关键科学边界

- **高分表示认知融合更多**（更容易被想法钩住），不是"越好"——报告与描述均按此表述。
- 7 题单一因子，无反向题，不输出子量表；不与 CFQ-13 的 4 题解离题混用。
- 测量的是与想法的关系方式，不是想法内容、不是思维能力、不是临床诊断。
- 原版主要在成人及大学生样本验证；平台 18+ 为保守边界，不外推中小学生。
- 独立中文工作译稿，未获专家译审、认知访谈或中国人群验证。
- 未填写 `sampleSize`：原报告样本量未从可得载体确认，不以估计值充数。

## 状态

DRAFT/CANDIDATE，未发布、未激活。preview 返回 `EXECUTABLE_NOT_PUBLISHED` 与
`LOCALIZATION_REVIEW_PENDING`，因此即便有 ACBS 研究用途声明，DRAFT 仍不可激活。
未新增数据库行，正式激活 0，双入口实际使用 NOTRUN。

# Psy-Flex 心理灵活性问卷（6题）— 中文工作译稿

原作者：Gloster, A. T., Block, V. J., Klotsche, J., Villanueva, J., Rinner, M. T. B., Benoy, C., Walter, M., Karekla, M., & Bader, K.（2021）
出处：*Journal of Contextual Behavioral Science*, 22, 13–23 · DOI: 10.1016/J.JCBS.2021.09.001
平台身份：`psyflex6_zh_cn_research@1.0.0`（第 63 个新增来源版本，第 59 个工具身份）

## 版本层

| 层 | 版本 | 实际运行身份 |
| --- | --- | --- |
| 题文／计分／本地化 | instrument1.0.0 / scoring1.0.0 / localization1.0.0 | 已创建，6题固定顺序，单一总分 6–30 |
| 参数 | score_only，无阈值 | ReferenceSet 未创建；`referencePolicy.type = none` |
| 报告 | report1.0.0 | score_only，无 bands、无标签；样例经真实 `buildScaleResult` 生成 |
| 目录标签 | 八轴 | 已写入 source，含授权风险标签；实际检索索引 NOTRUN |

## 授权状态：待授权

作者官方 PDF 未附明示许可文本，仅标注「English version by: Andrew Gloster
(send feedback to: andrew.gloster@unibas.ch)」。未见再分发或商业使用授权。
按项目政策记录为 `license:authorization_pending` + `license:author_contact_pending`，
`definition.license.status` 为 `unknown`，**不伪造为 verified**。
详见 [THIRD_PARTY_LICENSE.md](THIRD_PARTY_LICENSE.md)。

## 计分与回顾期

- 六题求和，范围 6–30；**越高表示过去七天自述的心理灵活性越高**。
- 官方 PDF 计分原文：*Sum all 6 answers. The higher the sum, the higher the psychological flexibility.*
- 回顾期为**过去七天**，属作者规定的测量内容，已在版本化 `instruction` 中完整呈现，
  不塞入题目、不作为计分题、不删除或改成长时窗。

## 六题与 ACT 六过程的对应

六题分别对应活在当下、对经验开放、想法抽离、稳定自我、价值觉察、承诺行动。
**只输出一个总分，不输出六个分量表**——每题一过程，不足以构成可解释的分量表；
对应关系保留在报告解释结构中，不作为独立分数。

## 关键边界

- 高分是**状态描述**（过去七天），不是人格、能力或心理健康水平的评价。
- 作者已发布官方中文版问卷；本译稿为独立工作译稿，不复制其措辞，也不继承其验证。
- 原版面向成人；平台 18+ 为保守边界，不外推中小学生。
- 独立中文工作译稿，未获专家译审、认知访谈或中国人群验证。

## 状态

DRAFT/CANDIDATE，未发布、未激活。preview 返回 `EXECUTABLE_NOT_PUBLISHED` 与
`LOCALIZATION_REVIEW_PENDING`，因此"官方 PDF 可公开下载"不构成可激活依据。
未新增数据库行，正式激活 0，双入口实际使用 NOTRUN。

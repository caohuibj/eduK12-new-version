# ACT 工具内容分支｜2026-10-28

本分支从 `main@6203a829dc8d7de707e67f413acfa5a354a21e09` 切出，用于补充接纳承诺疗法（ACT）相关测量工具。沿用 `SELcontents` 分支确立的内容入库模式：每个工具家族一个独立提交；全部为内容草稿，不导入生产数据库、不发布、不创建 PR、不触发 CI、不合并。

## 查重基线（新增前必查）

ACT 直接构念已有 6 个精确版本，全部为 DRAFT。新增任何工具前先对照下表与 `manifest.json`，同一构念的长短版/报告者版/年龄版不重复计为独立构念：

| instrumentKey | 构念位置 | 所在分支 | 状态 |
|---|---|---|---|
| mpfi24_zh_cn | 六过程多维心理灵活性/僵化（MPFI-24） | main 及全部内容分支 | DRAFT |
| aaq_us12_zh_cn_research | 大学生情境心理不灵活性 12 题（**非 AAQ-II**） | content/dot-local-scales-20261025 | DRAFT；来源核查 HOLD-RESEARCH，再分发权与 K12 适用性未核 |
| act_sq6_zh_cn | ACT 治疗会谈六过程帮助感（非日常灵活性） | content/dot-local-scales-20261025 | DRAFT |
| cfq7_zh_cn_research | 认知融合 7 题单因子（成人） | content/dot-local-scales-20261025 | DRAFT；权利 unknown/restricted |
| psyflex6_zh_cn_research | 心理灵活性，六过程各一题只出总分（PsyFlex） | content/dot-local-scales-20261025 | DRAFT |
| csacs9_zh_cn | 自我作为背景（SACS）9 题已发表中文版，18–25 大学生窄部署 | content/dot-local-scales-20261025 | DRAFT |

相邻构念（不重复计为 ACT，新增时需在 constructOverlapTags 中说明区别）：ffmq15 / chime_s24 / maia2_37（正念与内感受）；erq10 / ders16_bjureberg / ders_sf18 / erss19（情绪调节）；ccfq18 / cfsr12（认知控制与应对灵活性）；ebq16（情绪信念）；sop2（乐观）。学业价值 value_cost_* 与 ACT 价值澄清是完全不同构念，不得混同。

权威盘点与人工审校状态见 PR #365 `docs/scale-library-structure-20261027/candidate-list.md`；来源与权利核查记录见 `content/dot-local-scales-20261025` 分支 `docs/scale-instruments/research-drafts/github-source-discovery-20261026.md`、`github-source-expansion-wave2-20261026.md`。SELcontents 分支明确未给 ACT/一般心理灵活性贴个体 SEC 标签，本分支与 SEL 家族无直接重合。

## 首批候选（待逐项完成两项验收后再登记 manifest）

按 K12/学校场景空白排序：

1. AFQ-Y（青少年回避与融合问卷，17题）——现有 ACT 工具样本均为大学生/成人，青少年版是最大空白。
2. VQ（Valuing Questionnaire，10题）——价值维度目前为 0；需与学业价值 value_cost_* 明确区分。
3. AAQ-II（7题）——需明确与 aaq_us12 的版本区分并核对 K12 适用性证据；权利未确认前 catalog-only。
4. MPFI-12 短版——同家族版本，不另计新构念，可与 MPFI-24 对照后决定是否入库。
5. CompACT、教师版 ACT 工具、认知解离专项——后续批次。

## 验收约定

沿用 SELcontents 两项验收（题文与计分、报告）：每个家族独立提交；完整题文与再分发许可未确认前只做 catalog-only，不复制受限题文；缺答不补 0；不发明常模、百分位、临床界值或能力等级；中文工作译稿不标为已验证；golden cases 覆盖全中、全低、缺答与非法值。报告为 score_only 反思型文案加原始分/水平图，沿用现有 ReportRangeTrack，不引入新渲染框架。

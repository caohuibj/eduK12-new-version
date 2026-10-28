# CAMS-R（Cognitive and Affective Mindfulness Scale–Revised，12 题版）

## 工具识别

- 全称：Cognitive and Affective Mindfulness Scale–Revised（CAMS-R）
- 精确 key：`cams_r12@1.0.0`；单维总分自评；英文版（en）
- 评价对象：成人自报的日常正念品质（专注、当下、觉察、接纳的宽泛概念化）
- 原始文献：Feldman, Hayes, Kumar, Greeson, & Laurenceau (2007), *Journal of Psychopathology and Behavioral Assessment*, 29(3), 177–190（PDF 页脚经 Crossref 核对）

## 题文与计分验收：通过（原生 DRAFT，含一项如实记录的来源差异）

- 题文：12 条英文题干逐字取自 UC Berkeley GGSC 官方量表页托管的题本 PDF（SHA-256 `b9f7a26e…a53d`），反向键与求和规则为 PDF 逐字（题 2/6/7 反向；求和 1–12；高分=更多正念品质）。
- 选项锚点：**GGSC 官方表未印锚点文字**；本条目采用 4 点锚点（1=rarely/not at all、2=sometimes、3=often、4=almost always），逐字出处为同行评审开放获取文献对 CAMS-R 的描述（Europe PMC PMC13059079，另 PMC13370295、PMC10779681 一致），并在 source.md 完整记录该差异——锚点非原作者原件，取得原件后以原件为准。
- 缺答：任一题缺答 → 总分 null；complete_required 为产品保守约定，非原作者规则。
- 不发明常模、百分位、界值或能力等级；文献中的四方面主题描述不拆为官方子维度。

## 报告

- 原生模板接入系统现有报告架构（总分范围条形图 12–48 + 反思问题 + 可尝试行动）；图文样稿：[report_sample.html](./report_sample.html)（模拟数据）。

## 原生记录

- [instrument.ts](../../../server-version/backend/src/modules/scale/instruments/cams_r12/1.0.0/instrument.ts)：`cams_r12@1.0.0`，CANDIDATE / PILOT / DRAFT，en。

## 当前缺口与保留事项

- 许可：GGSC 公开托管，页面未附明确许可声明（`license:source_hosted_pdf`、`license:redistribution_review_pending`）。
- 锚点文字的最终依据仍是文献佐证而非作者原件（已记录）；如后续取得 Feldman 原版表，需复核后替换。
- 与本分支其他正念工具（FFMQ/KIMS/MAAS/TMS/CAMM）题本、结构与证据互不通用，分数不互换比较。

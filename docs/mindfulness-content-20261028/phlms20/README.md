# PHLMS-20（Philadelphia Mindfulness Scale，费城正念量表）

## 工具识别

- 全称：Philadelphia Mindfulness Scale, 20-item version（PHLMS）
- 精确 key：`phlms20@1.0.0`；两维（Awareness 觉察 / Acceptance 接纳）；英文原版（en）
- 评价对象：成人自报最近一周的当下觉察频率与对内在体验的接纳程度
- 原始文献：Cardaciotto, Herbert, Forman, Moitra, & Farrow (2008), *Assessment*, 15(2), 204–223

## 题文与计分验收：通过（原生 DRAFT，含一项如实记录的锚点口径冲突）

- 题文：20 条英文题干逐字取自 GGSC 托管的原始论文 Table 1（SHA-256 `ea0e7f1a…edfc1c`），全部弯撇号照录。
- 计分：论文 Table 1 官方计分注逐字——奇数题直加为 Awareness（10–50）、偶数题反向后求和为 Acceptance（10–50）；两维不合成总分（原论文 CFA 两维相关 r = –.02）。
- **锚点口径冲突（已记录）**：Table 1 注为 1=never…5=very often（1–5），论文 Study 2 正文为 0=never…4=very often（0–4）；本条目采用 Table 1 注的官方计分方向（1–5），后续独立验证亦按 1–5 描述，冲突完整记录于 [source.md](./source.md)。
- 缺答：任一题缺答该维度记 null；complete_required 为产品保守约定，非原作者规则。不发明常模、百分位、界值或能力等级。

## 报告

- 原生模板接入系统现有报告架构（两维范围条形图 + "两个维度各自独立、无总分"的解读 + 反思问题 + 可尝试行动）；图文样稿：[report_sample.html](./report_sample.html)（模拟数据）。

## 原生记录

- [instrument.ts](../../../server-version/backend/src/modules/scale/instruments/phlms20/1.0.0/instrument.ts)：`phlms20@1.0.0`，CANDIDATE / PILOT / DRAFT，en。

## 当前缺口与保留事项

- 许可：SAGE 付费墙论文；GGSC 托管副本页脚印 "Not for commercial use or unauthorized distribution"（`license:source_hosted_pdf`、`license:redistribution_review_pending`）；论文注明量表可向作者索取。
- 锚点 1–5 vs 0–4 的论文内冲突已存档；取得作者原版施测表后复核。
- 与本分支其他正念工具分数不互换比较。

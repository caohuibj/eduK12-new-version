# TMS-13（Toronto Mindfulness Scale，状态正念）

## 工具识别

- 全称：Toronto Mindfulness Scale, 13-item state version
- 精确 key：`tms13@1.0.0`；状态正念两维（Curiosity / Decentering）；英文原版（en）
- 评价对象：刚结束的一次冥想/练习中的即时状态（指导语 "what you just experienced, just now"）
- 原始文献：Lau, Bishop, Segal, Buis, Anderson, Carlson, Shapiro, & Carmody (2006), *Journal of Clinical Psychology*, 62(12), 1445–1467

## 题文与计分验收：通过（原生 DRAFT）

- 题文：13 条英文题干、指导语、五档锚点与官方计分键**全部逐字取自论文 Appendix（正式 administered 版）**，非二次转述；工作副本 SHA-256 `871ed6c1…e154`。
- 编号：采用附录官方编号 1–13；与正文 Table 1（EFA，题池号 06–42）的映射已记录在 source.md。题池 29、20 两题在 CFA 中被剔除，不在 13 题内；第 11 题正文与附录存在一处措辞差异（over-identifying them / overidentifying with them），以正式 administered 版为准并如实记录。
- 计分：官方键"全部题目正向、无反向"；Curiosity（3,5,6,10,12,13）求和 0–24、Decentering（1,2,4,7,8,9,11）求和 0–28；论文未给出总分合成规则，**两维不合成总分**。
- 缺答：任一题缺答该维度记 null；complete_required 为产品保守约定，非原作者规则。
- 不发明常模、百分位、界值或能力等级。

## 报告

- 原生模板接入系统现有报告架构（两维范围条形图 + 反思问题 + 可尝试行动；叙事明确"状态≠特质、单次有起伏"）；图文样稿：[report_sample.html](./report_sample.html)（模拟数据）。

## 原生记录

- [instrument.ts](../../../server-version/backend/src/modules/scale/instruments/tms13/1.0.0/instrument.ts)：`tms13@1.0.0`，CANDIDATE / PILOT / DRAFT，en。

## 当前缺口与保留事项

- 许可：期刊论文为 Wiley 付费墙内容；本副本为 Rotman-Baycrest 机构仓库公开托管，未附再分发许可声明（`license:institutional_repository_copy`、`license:redistribution_review_pending`）。
- 状态正念使用边界：不与特质正念分数混合计分或比较；TMS-T 特质版（Davis et al., 2009 等）为另一题本。
- 题池→正式编号映射与正文/附录措辞差异已存档于 source.md。

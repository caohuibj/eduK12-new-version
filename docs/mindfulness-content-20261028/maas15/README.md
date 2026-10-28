# MAAS-15（Mindful Attention Awareness Scale 15 题版）

## 工具识别

- 全称：Mindful Attention Awareness Scale, 15-item version（题本标题 "Day-to-Day Experiences"）
- 精确 key：`maas15@1.0.0`；单维频次自评；英文原版（en）
- 评价对象：成人自报日常体验中"走神/自动导航"式不留心体验的出现频次
- 原始文献：Brown & Ryan (2003), *Journal of Personality and Social Psychology*, 84(4), 822–848

## 题文与计分验收：通过（原生 DRAFT）

- 题文：15 条英文题干逐字取自宾夕法尼亚大学积极心理学中心（PPC）公开托管的官方题本 PDF（SHA-256 `75bf41d4…264a9`，3 页），逐字核对记录见 [source.md](./source.md)；第 10 题撇号在 PDF 中即为直引号，照录。
- 计分：官方计分页只写"取 15 题均值；高分代表更高特质正念"。逐题极性核对确认 **15 题全部为不留心式措辞**，且锚点 1=Almost Always → 6=Almost Never 与题干方向相反，因此**直接对原始作答取均值即为官方实现，无反向题**（详见 source.md 计分方向核查一节，含被否决备选的存档）。得分范围 1–6。
- 缺答：任一题缺答，均值不计算（null）；complete_required 为产品保守约定，非原作者规则。
- 不发明常模、百分位、界值或能力等级。

## 报告

- 原生模板接入系统现有报告架构（单维均值条形图 + 反思问题 + 可尝试行动）；图文样稿：[report_sample.html](./report_sample.html)（模拟数据）。

## 原生记录

- [instrument.ts](../../../server-version/backend/src/modules/scale/instruments/maas15/1.0.0/instrument.ts)：`maas15@1.0.0`，CANDIDATE / PILOT / DRAFT，en。

## 当前缺口与保留事项

- 许可：UPenn PPC 公开托管题本 PDF，但页面与 PDF 均未附明确使用/再分发许可声明（`license:source_hosted_pdf`、`license:redistribution_review_pending`）；翻译与再分发前需另行确认权利范围。
- 作者维护的 mindfulexperience.org 学术页面已不可访问（门户化/停放），官方逐字反向说明无处可查——本条目方向结论以官方 PDF 计分页 + 逐题极性核对 + GGSC/selfdeterminationtheory 佐证为准，核查轨迹完整存档于 source.md。
- State MAAS、MAAS-AANS（青少年版）、5 题短版等派生版本的题本与计分规则不同，不与本条目混用。
- 原始验证样本为美国成人样本；不构成中国或任何本地人群常模。18 岁下限为产品边界。

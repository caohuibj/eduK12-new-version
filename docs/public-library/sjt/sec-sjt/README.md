# SEC-SJT 研究准备版（DRAFT，不可发布）

原作：Daniel Wolf、Sarah Schneider、Astrid Schütz (2020)，Otto-Friedrich-Universität Bamberg。https://doi.org/10.20378/irb-48863

本阶段从既有 research-draft-2026-10-21-r2 材料选取 SEC-SJT，加入独立 DRAFT V2 源包、生成目录与有界契约测试，不合并旧分支。不代表已发布、可供真实被试使用或已接通 Survey。中文仍为未经人工专业双语审校、回译、认知访谈和本地验证的工作初译。

## 内容与评分

- 完整德文、中文及双语 JSON/对照稿，保留指导语、独立练习、10 个正式情境与 50 个正式选项，保持原顺序。
- 练习 5 选 1，RAW_ONLY，无评分键、贡献或正确反馈。强制一次练习选择是本数字草案的交互要求，不冒称原作者评分规定。
- 正式题 SINGLE_CHOICE，匹配原共识/专家键记 1，其他有效选择记 0；完整总分为 0–10。任何正式题缺答则唯一总分 null，不填零、不插补、不折算。
- 原纸本每页 2 题，本草案每页 1 题并明确说明改编；原分页提示保留，不声称等效。无测验硬时限，允许休息，不承诺无限会话保存。
- 原目标人群为 15 岁 0 个月至 24 岁 11 个月、有认知/心理障碍支持需求的职业准备人群；德国便利样本 N=306、α=.65，不是普通学生常模。
- 不部署德国百分位、T 分、≤5 后续评估阈值、诊断/风险/健康标签或 SEC-I 八维分量表。匹配更多不等于心理更健康、道德更好或现实表现更佳。

## 交付与验证

源包位于 server-version/backend/src/modules/situational/instruments/sec-sjt-zh-hans/1.0.0，publication.json 为 DRAFT，scientific.json 不伪造人工审核或中文有效性证据。

2026-10-23 独立复核官方手册第 4 页许可、第 42–44 页缺失规则、材料第 39 页评分表及原工作簿 BD41:BM41 公式。原件字节指纹与来源记录一致。新的有界测试覆盖独立 50 格 option×metric oracle、所有可能总分、练习隔离、缺失、固定流程、报告及参与者投影不泄露评分键。精确范围和首轮 SSR 构建参数失败保留于 source-implementation-evidence.json；不把它称作完整 CI、浏览器或数据库 FINAL 验收。

当前 Survey 适配层拒绝 RAW_ONLY 和 optional 通道，因此本包不能直接导入普通 Survey。最小适配语义见 implementation-note.md，禁止删练习或强制正式作答来伪装兼容。

## 文件与历史证据

sec-sjt.*、instructions.*、scoring-contract.json、score_reference.py 保存完整选取内容与参考评分；report-copy.* 保存解释边界；LICENSE.md、ATTRIBUTION.md、source-provenance.json 保存权利来源。TRANSLATION_REVIEW.md、REVIEW_SUMMARY.md、validation-results.json 与 notion-backup-evidence.json 是历史证据，不代表本轮重新执行或更新 Notion。manifest.json 绑定本轮文件；原手册 PDF、题本 PDF 和 XLSX 不重复入仓，使用 source-provenance.json 的官方链接及 SHA-256。

Notion 历史页面：https://app.notion.com/p/400d27635a3881cea235fd5df7384d28 。本轮未写入或复验该页面，后续由协调者按工具单独维护。

## 许可

原手册 PDF4 明确手册、材料和评分工作簿均为 CC BY-SA 4.0。选取德文、中文工作译稿、数字改编与参考评分材料保留独立署名、许可及改编说明；并非 MIT、公有领域或 NC。通用平台代码及测试程序仍按仓库许可，不因加载这些素材改标 BY-SA。“研究草稿”是科学/发布状态，不添加研究专用许可限制。

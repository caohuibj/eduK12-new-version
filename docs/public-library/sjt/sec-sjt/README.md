# SEC-SJT：德文原版与中文工作初译（研究素材，runtime HOLD）

原作：Wolf, Schneider & Schütz (2020)，Otto-Friedrich-Universität Bamberg。https://doi.org/10.20378/irb-48863

本目录只保存公开研究素材及其说明，没有加入 registry、可执行量表／测验目录或 runtime。独立内容审查结论为 GO_FOR_DRAFT_CONTENT，无阻断性译修；它不是临床施测、中文验证或 runtime 发布资格。中文仍是未经人工专业双语审校、回译、认知访谈和中文心理测量验证的工作初译。

## 冻结版本与复制证据

- 内容版本：research-draft-2026-10-21-r2。
- 原完整研究归档 SHA-256：9602baef09baa6ac7e76ee23edd335cf1cb8413a779a076f1d63ebbd01c5f304。
- 原 SHA256SUMS 清单 SHA-256：719b1cac112205923af13d138554985196b9361daad1a7ac469e92ba0fa9616b。
- 原 r2 的 279 项本地内容／参考评分检查结果仅作已有证据保存，本轮未重跑。
- 本轮只做一次 18 份所选文件的 SHA-256 复制完整性核对，全部与原冻结清单一致。逐文件选择、大小、哈希与排除范围见 manifest.json。

## 所保存的文件

- sec-sjt.bilingual.research-draft.json、sec-sjt.de-original.json、sec-sjt.zh-Hans-working.json：完整 10 情境、50 选项的双语／单语数据；保留原题号、页码、选项序和原键。
- sec-sjt.de-zh-Hans.parallel.md：完整可阅读德中对照，含原版指导语和独立练习。
- instructions.de-zh-Hans.json：原版指导语、练习、纸本提示、人口字段记录与明确分开的平台说明。
- scoring-contract.json、score_reference.py：原键和严格完整作答规则；小型参考函数不被产品导入或执行。
- report-copy.zh-Hans.json、report-copy.zh-Hans.md：完整、缺答、无效输入和施测质量存疑时的报告文字。
- LICENSE.md、ATTRIBUTION.md、source-license-and-disclaimer-de.txt：CC BY-SA 4.0 独立许可、完整署名／修改说明及原免责声明。
- source-provenance.json、source-sec-sjt-pages-20-26-de.txt：来源、原文件指纹及仅 SEC-SJT 所需页的原文字提取。
- source-quality-warnings.json：原表 A16 不一致值及行和警示，不校正或校准。
- TRANSLATION_REVIEW.md、REVIEW_SUMMARY.md、validation-results.json：修订、歧义登记与原 r2 的核对证据。
- README.md、manifest.json：本次仓库子集说明及复制清单。
- notion-backup-evidence.json：既有 Notion 页内容与三份原件托管回读证据。

## 明确没有入仓库

不复制 QA 页面 PNG、tar.gz、整份原手册／题本 PDF、原评分 XLSX、无关 SEC-I 题目或重建／全量验证脚本。原手册、原题本和评分工作簿独立保留官方链接，并另在既有 Notion 页面托管原件。本目录不是原研究包的完整镜像；source-provenance.json 内上一级文件路径属于原研究环境，不是当前仓库可读路径，使用其稳定 URL 和 SHA-256 定位来源。REVIEW_SUMMARY.md、validation-results.json 所述截图／检查也是原 r2 证据，不代表这些文件都随此子集入库。

Notion：https://app.notion.com/p/400d27635a3881cea235fd5df7384d28?pvs=204

Notion 已完成更新并回读：148 个德中题文／选项／指导语／练习文本单元完整、10 个正式题标题齐全、3 份原件均为实际托管 native 附件（2 PDF、1 XLSX）。未更改页面权限。SHA 标签是已核验的本地原件指纹；未额外宣称已重新下载 Notion 托管字节核对 SHA。详见 notion-backup-evidence.json。
官方记录：https://fis.uni-bamberg.de/entities/publication/b64e469f-1bea-488c-8ac7-186222773827

## 不可省略的实施边界

- 正式部分为 10 题、每题 5 选 1，选择“认为最好的回答”，不是通常行为。独立练习不计分。
- 原键（1 起始）：3、4、2、1、4、3、3、3、2、3。每题匹配 1，否则有效作答 0；完整总分 0–10。
- 任一正式题缺答则全测不计分，不按错误处理，不插补，不折算；无效格式或多选也不能计分。
- 无硬性限时；通常约 30 分钟、个别约 60 分钟，允许休息。
- 原人群为 15 岁 0 个月至 24 岁 11 个月、有（亚）临床认知或心理障碍、尤其处于学习障碍支持／职业准备情境的青年。德国便利样本 N=306，α=.65，信度有限，非中国 K12 验证。
- 不部署德国百分位、T 分、原版 ≤5 后续评估建议、诊断／风险标签、健康方向或八分量表。更高原始分只表示匹配原键更多，不等于更健康或现实行为更好。
- 手册正文正确率上限 76.14% 与表 A16 第 4 题 80.72% 冲突，部分行和不是 100%。保留原值，不静默修复、归一化或重定键。

## 许可

原手册 PDF4 明确三种原材料采用 CC BY-SA 4.0，不是 NC，也不等于公有领域。译文及改编沿用 CC BY-SA 4.0，并保留原作者、来源、许可和修改说明。本目录素材不能被仓库根目录的 MIT 许可证覆盖。“研究草稿／runtime HOLD”描述本项目的科学与部署状态，不是对 CC BY-SA 增加的非商业或研究专用限制。

本次不改 registry/runtime，不运行 CI，不 commit/push，不合并。

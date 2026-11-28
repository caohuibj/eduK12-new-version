# COPSOQ III 中国医疗工作者 S1 中文事件分项

本组为 Huang 等 2025 年论文公开附件 S1 中文原题中的八组事件题，用于成年医疗工作者的非商业研究。整套研究的 89 题终版须依据作者的最终题本与计分原件核对。本组仅提供频次、来源选择与条件访问的描述性报告。 [正式论文](https://www.mdpi.com/2227-9032/13/7/825) · [期刊公开附件 ZIP](https://mdpi-res.com/d_attachment/healthcare/healthcare-13-00825/article_deploy/healthcare-13-00825-s001.zip) · [COPSOQ 国际网络使用条款](https://www.copsoq-network.org/licence-guidelines-and-questionnaire)

## 题本和导入

- `index.json` 对应进度清单中的 8 个中文源条目。以 PDF 文件页序为准，原题见第 9–11 页，中文选项见第 15 页，BU2 可选结构性缺失见第 16 页开头。英文定义段在 BU1 的中文栏未译入，本中文分项沿用 S1 中文栏原文。
- 各目录含原格式 `*.form.json`、按原题条件和顺序的 `flow.json` 及独立中文 `review.md`。表单保留公开中文原文，报告和原创配图与题文独立。
- 依法授权的管理员可用现有 `POST /api/platform/survey-tools/submissions/original-form` 提交候选。项目波次按同目录的 Survey Flow 组装原 Form 区段，`instrumentIds` 使用对应项目的真实草稿 ID。具体入口、伦理、招募范围和正式启用由既有业务流程处理。
- 只有是的每天、每周、每月一次或数次会显示来源多选区段。不是、未答和拒答会分别保留原频次回答或缺失状态，来源均为未显示。CQ 只有频次，BU 的顺序为 BU1、条件 BU3、独立 BU2。

## 分类报告

使用 `node report-summary.mjs GS survey-descriptive-summary.json`，输入为获授权的 Survey 项目描述性分析 `GET /api/survey/projects/:pid/analytics/waves/:wid/items` 的 JSON。报告沿用 [国际版事件分项的类别聚合器](../../copsoq-iii-events/1.0.0/report-summary.mjs)，由中文索引绑定独立的中文 Form 键。来源多选以选出至少一个来源的人数为有效分母，一人可从多个类别计数。BU2 的不适用作为结构性缺失单列，排除有效分母。报告仅包含类别、计数、比例和缺失说明。

以上为本机候选文件。既有分配、访问和生产流程分别由研究项目负责人管理。

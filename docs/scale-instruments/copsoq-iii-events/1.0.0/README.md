# COPSOQ III 国际英文附录事件题

8 个原版事件指标，作为 Survey 类别描述工具。英文题干和选项来自原附件第 16、17、20 页。报告采用独立中文解释。用于能够阅读英文原题的成年工作人群非商业研究，归属 COPSOQ International Network。 [国际版原件](https://www.copsoq-network.org/assets/Uploads/COPSOQ-network-guidelines-for-the-use-of-COPSOQ-III-290618sig.pdf) · [原版使用条款](https://www.copsoq-network.org/licence-guidelines-and-questionnaire)

## 文件与导入

- `index.json` 对应 8 条进度清单记录和原件指纹。各目录的 `*.form.json` 是原格式表单候选，`flow.json` 给出原题条件和顺序，`review.md` 是独立报告审稿。
- 有系统权限的管理员可将各原格式表单提交至既有平台入口 `POST /api/platform/survey-tools/submissions/original-form` 进行候选审核。源题块使用同目录的流程组装。源题块独立投放时一般无法复现原版跳答。
- 项目管理员也可以按相同 `instrumentKey` 在已有的 Survey 项目建立 Form 草稿，再用其原始 `definition` 保存。创建波次时，`instrumentIds` 使用对应项目中 1–3 个草稿的真实 ID，`flowDefinition` 使用同目录的 `flow.json`。已有的开场、同意文本和访问设置由获授权的研究负责人按项目实际配置。此处的内容文件和离线核对均不会创建活动波次或写入生产。
- 频次为五个原版类别。只有四个肯定频次触发来源块，同一原题有且仅有一个稳定键。选择 No、未答或明确拒答时来源为 `NOT_SHOWN`。发生冲突与争吵（CQ）原版只有频次题。欺凌（BU）依原题顺序是 BU1、条件 BU3、独立 BU2。
- Survey 标准描述性分析输出分类分布与缺失原因。源问卷 Form 直接提交走统一版本管理流程。此内容采用既有 Survey 波次流程组装，单条 Form 元数据没有单独内置报告模板或新的权限入口。

## 输出类别报告

调用 `node report-summary.mjs GS survey-descriptive-summary.json`，输入为获授权研究人员从 Survey 既有 `GET /api/survey/projects/:pid/analytics/waves/:wid/items` 获取的完整描述性分析结果（最多 250 个 FINAL，含 `combinationFrequencies`）。可直接使用成功响应的 JSON。分页单题分析缺少源组合计数，不可用于此报告投影。报告列出原类别、计数、有效分母与比例，略去个人答卷、来源组合及可识别信息。对外发布仍使用项目既有权限与汇总范围。来源题每人可选多个类别，比例总和可超过 100%。来源题未选中任何选项按已显示但未答保留；明确拒答与未显示单列。BU2 可选无上级或同事项，在此报告投影中作为结构性缺失单列并排除有效分母。

## 试算范围

候选内容通过本机既有原格式 Form 接纳、波次流编译、FINAL 作答及分类摘要。合成答案覆盖四类肯定频次、否定、空白、拒答、多选来源、隐题答案拒绝以及 BU2 的独立路径与不适用。实际发布、入口授权和在役系统部署仍由平台既有流程管理。

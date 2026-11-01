# 成人认知控制与日常自我调节 DRAFT

本轮在 main `24061f5e349d1f8df34b0ed5dd99a33e3014da8c` 上扩展原成人包，新增 `integrated_gonogo_adexi_adult_zh_cn_v1@1.1.0`；原 `1.0.0` 定义、ADEXI 题文、计分与历史报告内容未改写。源码登记和本地验证不等于生产安装、正式发布或使用授权。

## 复用与改动

复用 `declarative-evidence-v1@1.0.0`、现有 package/fixture/generated 工作流、成人年龄 Context、BundleReportFacts、授权投影、发布审核及历史冻结读取。没有新建表、引擎、门禁、哈希机制或评分服务。EVC/JD-R 的 Profile 归一化没有用于本组合。

| 来源 | 冻结身份 | 本包用途 |
| --- | --- | --- |
| Go/No-Go | config/engine/scoring `1.0.0/1.0.0/1.0.0`，standard，120 试次；30 No-Go、90 Go | 误按率、遗漏率、d′、误按次数和真实分母 |
| CPT-X | config/engine/scoring `1.0.0/1.0.0/1.0.0`，standard，180 试次、3 区组、36 个 X 目标 | 目标遗漏、非目标误报、d′、命中反应时变异及目标/命中次数 |
| ADEXI | `adexi_v1@2.0.0`，项目中文适配，自评，14 题 | 工作记忆合计 9–45；抑制合计 5–25，高分表示报告的困难更多 |
| 年龄 Context | `integrated-adult-age-v1@1.0.0` | 18–100 岁；上限对齐现有 ADEXI 产品 applicability。不是年龄常模 |

查重覆盖旧 Scale package registry、现有 instruments 与 generated executable registry、legacy ADEXI migration、实际 scale seed 路径、认知任务 seeds/definitions、旧新 Bundle 目录、认知分析协议和公开中的相关 PR。`adexi_v1` 的旧行迁移到 2.0.0 已有专用兼容逻辑，不新增第二个 ADEXI 工具。现有 Go/No-Go 与 CPT-X 是项目实现的范式，不冒称某商业标准测验。未加入 SST/N-back，也未修改任务、时序、练习或随机化。

报告用已有 `ReportRangeTrack` 展示 0–1 的任务事件比率与 ADEXI 原分量尺，两类来源分区。d′ 和反应时变异保留原值；变异系数不被夹到 0–1，负 d′ 保留。分母只读取公开的冻结计数；CPT 非目标计数没有被公开，不从比率反推次数。没有综合执行功能总分、IQ、能力等级、百分位、诊断或按分数分型。

共享 UI 只增加一个薄展示组件和固定构念名称字典：按明确的 construct/sourceKind 配对绘图，不按 bundle key 分支，不推断陌生量表范围，不读取原始答案或重跑评分。未识别的历史报告沿用原展示；原始指标在本包折叠区保留。缺失、无效、未获披露授权、整体 invalid/unavailable 不产生伪造图点。质量有限有明确附注。

使用真实分母暴露了原依赖检查的类型不匹配：认知注册表以 `integer` 表示计数，而声明式 JSON 合同使用 `number`。本轮仅允许该方向兼容；其他类型、单位、来源四元组继续精确匹配，不转换参与者数据。

旧 `inhibitory_control_multisource_v1` 仍是 DRAFT、不推荐创建；仅更正其“不限年龄”的误导文字为 ADEXI 成人边界，不声称给旧协议新增施测年龄执行能力。

## 来源核验与许可标签

核验日期：2026-11-01。原文公开性、译本身份、使用许可和项目既有声明分别记录。未知不挡本 DRAFT 整理，仍沿用管理员最终审核。

| 材料 | 来源与公开性 | 身份/核验结果 | 标签与待管理员核对 |
| --- | --- | --- | --- |
| ADEXI 官方英文自评全文 | [作者官方下载](https://chexi.se/onewebmedia/English%20ADEXI%20self-report.pdf)，公开 | 14 题自评，1–5 符合程度 | `PUBLIC_SOURCE`，非新引入工具 |
| ADEXI 官方简体中文自评全文 | [Angela Siu / CUHK 题本](https://chexi.se/onewebmedia/Adult%20Self%20Report%20Executive%20Functioning%20Inventory_SimplifiedChinese.pdf)，公开 | 与项目 2.0.0 的题文、选项文字不完全一致；不能将项目文本称为该官方逐字译本 | `PUBLIC_SOURCE`、`OFFICIAL_TRANSLATION_AVAILABLE`、`PROJECT_ADAPTATION_DIFFERS` |
| 官方分量表计分 | [作者计分说明](https://chexi.se/onewebmedia/ADEXI%20subscales.pdf)，公开 | 工作记忆 1/2/5/7/8/9/11/12/13；抑制 3/4/6/10/14；官方采用分量表均分。现有 2.0.0 合计分的题号归属相同，量尺不同 | `SOURCE_SCORING_VERIFIED`、`PROJECT_SUM_SCORE`；不静默除以题数修改历史分数 |
| 官网使用与常模说明 | [Translations](https://chexi.se/translations)，公开 | 已有语言版本的使用无需另获作者许可；尚无可直接作年龄缺陷判定的常模 | `PUBLIC_USE_STATEMENT`、`NORMS_NOT_AVAILABLE`；商业数字化、改写与再分发范围仍 `UNKNOWN` |
| 项目中文适配授权与审阅声明 | 现有 `adexi-v2.ts` 与 instrument localization 源码；原凭证未在本轮可见材料中取得 | 源码写有 authorized、restricted redistribution、专家审核完成；本轮未将这些文字当成原授权凭证 | `EXISTING_PROJECT_DECLARATION`、`ORIGINAL_RIGHTS_EVIDENCE_NOT_REVIEWED`；保持版本，不新增授权声称 |
| 认知任务实现与版本 | 仓库 main 的 task seeds、definitions、scorers；公开项目源码 | standard Go/No-Go 与 CPT-X 精确身份存在可执行种子；report referenceMode=none | `PROJECT_IMPLEMENTATION`、`NO_REFERENCE_NORMS`；相关运行器本轮未修改 |

无缺失的成人核心工具，因此不重复导入 ADEXI、不复制官方全文进公开代码仓库。公开链接已作为参考文献进入新包，现有项目题文原地复用；没有向公开仓库新增非公开原件或权利未明的完整题本。

## 文献

- Holst, Y., & Thorell, L. B. (2018). Adult executive functioning inventory (ADEXI): Validity, reliability, and relations to ADHD. *International Journal of Methods in Psychiatric Research, 27*, e1567. [DOI](https://doi.org/10.1002/mpr.1567)；[PubMed](https://pubmed.ncbi.nlm.nih.gov/28497641/)。这是原工具研究，不是当前项目中文改写译本或本组合的效度研究。
- Toplak, M. E., West, R. F., & Stanovich, K. E. (2013). Practitioner Review: Do performance-based measures and ratings of executive function assess the same construct? *Journal of Child Psychology and Psychiatry, 54*, 131–143. [DOI](https://doi.org/10.1111/jcpp.12001)。20 项研究、286 个相关比较、中位相关约 .19 支持两方法不可互换的谨慎解释；不能由此推断个人差异、联合切点或本包效度。

联合解释只在声明的核心证据可解释时给出互补性说明和可尝试的行动，不作效应保证。限制/来源附注不伪装成量表标准化研究结果。

## 验证与交付边界

执行环境 Node 24.21.0；锁文件、Prisma/schema 和运行器未改。定向本地验证及原失败见 [验证记录](validation.md)。只创建 Draft PR；正式 CI 资格、隔离 DB 的 START/FINAL/落盘/恢复全链、实际用户权限、生产安装/入库、发布、合并和部署均未执行。报告截图使用合成数据，只证明 Chromium 排版与本次显示，不证明真实任务视觉、计时或生产链。

CI 激活前已从 Qiang 连接读取既有 [CI 常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)。Hui 连接同页 404，随后在另一已连接账号成功读取。适用 CI-003（类型闭包）、CI-007（生成物）、CI-008（DOM/窄屏）、CI-020（准确 source/base 与证据边界）。本 Draft 不主动激活 CI，不把本地通过声称为正式门禁成功；将精确候选交回主对话复核。无新审核流程。

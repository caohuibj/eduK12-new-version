# Massachusetts Inclusive Practice Self-Assessment — 原生无分 Form 候选

本批实际准备并在**新建本地隔离开发库**导入回读两份英文 Form；不是目录占位。内容版本均为 `0.1.0`，计分参数版本、报告版本均为 `null`。状态是 `SUBMITTED` 待审核，没有上线、生产写库、独立人类批准或试测参与者。

| 子项 | 原题范围 | 原生字段 | 用途 |
| --- | --- | --- | --- |
| `mass_inclusive_practice_part_a_en` | Tool 2d, Part A, PDF pp.2–3 | 22 个可选文本字段，其中13个原版反思问题 | 学生学习证据、需要、支持、实践优势与优先发展方向；其余为原有教师／评价者／学校／团队背景字段 |
| `mass_inclusive_practice_part_b_en` | Tool 2d, Part B, PDF pp.4–7 | 9个单选实施状态＋9个备注 | 保留九个 Power Elements 及全部描述和示例，按原表顺序自查 |

母工具名称前缀统一为 `Massachusetts Inclusive Practice｜…｜教师自评｜EN·2017指南无分表单`。共同标签 `family:mass_inclusive_practice` 与 `role:teacher_self`、`stage:k12`、`language:en`、原版本、发展反思用途、PILOT、无分、非商业教育许可标签保存在现有 `reference.tags`；受控 `classificationTags` 只使用现有教师、自评、研究、非诊断、PILOT、英文标签。现行导入器实际保留自由标签在 `reference.metadata.annotations.tags`，隔离库按共同标签查询两项成功；**不声称现有 UI 已把这些自由标签投影为筛选面板**，没有扩充标签引擎或字典。

## 已实际读取的原来源与权利范围

- [官方七页独立题本 Tool 2d](https://www.doe.mass.edu/edeval/guidebook/2d-teacherselfassess.pdf)：SHA-256 `e5d4ebf240ec79e71df9c30f12aa6cc4ed271a64e4ff3e1eb58b2e057bdd2722`。
- [官方整本 Guidebook DOCX](https://www.doe.mass.edu/edeval/guidebook/guidebook.docx)：SHA-256 `7cdc21aa2882c5216c6b8c1600e1a18771f2e87c44ac1f67eb165dc3d89a6a92`。版权页 ©2017 Massachusetts Department of Elementary and Secondary Education，明确允许署名后复制全部或部分材料用于非商业教育。
- [官方入口](https://www.doe.mass.edu/edeval/guidebook/)同时链接上述文件。整本 Word 的 Tool 2d 与独立 PDF 原题对应，并提供可核实的版权页。
- 扩展研究报告 C01 已核读；研究报告是检索线索，题项和权利判断直接回到官方文件。

这里只复制英语题文供非商业教育使用，并保留原作者。公开下载和上述非商业教育许可**不构成商业嵌入、收费服务或翻译改编授权**。中文目录名和原创中文教师反思说明是项目文案，没有把题文翻译称为验证中文版。单份 PDF 无印刷修订号；元数据创建于2020、修改于2026不等于题本正式版本。该候选明确绑定2017整本指南及2026-11-02取得的 PDF 字节，不冒称最新标准。题文不适用仓库代码的宽松许可，见 [THIRD_PARTY_LICENSE.md](THIRD_PARTY_LICENSE.md)。若实际拟用环境是商业服务，先取得相应权利；本次没有发布到该环境。

## 原样结构与数字化边界

A 表保留13个原版问题，包括原文 `How I do know…` 的排印错误和 Part 2 再次询问 SOME／A FEW 支持的两题，不去重删题。B 表保留九组完整教师描述、示例和备注：I-A-2、I-B-1、I-B-2、II-A-3、II-B-1、II-D-3、III-C-1、IV-A-1、IV-E-1。PDF/DOCX 的抽取文本包含隐藏的管理者标题；本次看过 PDF pp.4–7 的可见页面，只使用可见教师标签，没有据抽取顺序误建管理者平行版。

原表的 Yes/no/partial 顺序保留为 `yes`、`no`、`partial`，没有数值、反向、范围、阈值或总分。漏答、拒答保留为缺失事实，不补值、不当作 No。全部字段可选；文本2000字符限制和拒答能力是现有 Form 的技术设置，不是官方完成度或评分规则。A 表纸面签名／日期及评价者接收回执没有冒充电子签名或教师自答字段；原签名含义仅为接收，不表示批准，仍由既有外部评估流程办理。

原文有 “learning styles” 历史措辞，作为来源文本保留，不据此给学生贴固定类型、不推荐按所谓风格匹配教学。发展建议着眼任务需要、无障碍支持、具体学习证据和学生实际反应。未导入其他 Guidebook 工具 2a/2b/2c 或 3a/3b，不把本表已有的“拟采用何种实践”问题冒充新增官方行动计划表。

普通组合可选 A→B，保留原顺序，见 `batch.json`。组合只为组织施测，当前为清单而非已发布组合，没有跨表总分、心理潜变量、常模、教师排名或新 Bundle 引擎。两份表单可分别选择；无独立测量效度承诺。

## 接收者与成长反馈

填答者和首要接收者都是教师。该工具不包含原生学生平行版，未造学生版或学生报告。无分 Form 不生成计分报告；[teacher-reflection-examples.md](teacher-reflection-examples.md) 是可供教师阅读的原创非自动反思说明，覆盖已有实践、遇到困难、证据不足三种情境，不能据选择自动划档或当作已发布 R 版本。

个体文本、团队信息、特殊教育与家庭沟通内容仅按既有接收者授权和发布规则可见，不因本次候选而交给评价者、学校或其他教师。管理员身份、匿名／发布／最小人数规则不变。演示仅使用合成账号与去标识合成答案，无真实学生资料。

## 排重和验证证据

基于实际 main `688d61eb61094fe692ad8c6e6ce41315c8bc3402` 独立工作树；保护此前 Panorama 和 CSS-T/CSAS 成果。检查 main 文档／量表来源目录的母工具名、Tool 2d URL／别名，及45个开放 PR 的标题／正文，没有发现同源。#541 Massachusetts DESE Student/Staff Survey 的来源和填答对象不同，不因同机构误去重。并非逐一查询所有开放 PR 的私有数据或生产／管理员自建库；生产最终排重仍未执行。管理员正式导入前再按来源URL、作者、版本、题项核对，存在同源则引用已有版本。

`validation.json` 记录本次真实结果：隔离库 `eduk12_mass_inclusive_verify_20261102` 从空库迁移后，调用现有 `submitOriginalForm`→`governedDetail` 导入两项，均 `SUBMITTED`、`approvedBy=null`、无 trials／在线授权，C=0.1.0、P/R=null；40字段逐项回读相等，原生 artifact 无计分摘要和报告。

只运行该内容的schema编译、八个作答情境、非法选项／数值作答／超长文本／未知字段／非系统管理员拒绝、一次幂等重交、共同tag SQL查询。原题／描述以官方 DOCX 文本与可见 PDF 核对，核对清单在 `source-map.json`；不是独立翻译或人类科学评审。执行脚本 `/tmp/mass-inclusive-verification.mts`、数据文件、实际消费者和锁文件摘要见验证记录。不把单次读取的预期清单比较宣传成独立验证工具的准确率。

没有修改 runtime、schema、权限、引擎、受控标签、冻结版本或共享索引，没有安装依赖或运行平台全量测试。临时复用已有本地锁定依赖；没有历史完整 node_modules 字节清单证明。正式 CI 尚未运行，隔离验证不是官方合并门禁。现有 Scale 专用 intake 选择器要求 instrument.ts，本批是原生 Form，不能伪装 Scale 以获得该路线。主线按真实差异串行协调合并，当前不自行合并或生产发布。

管理员下一步：确认实际使用处于非商业教育权利范围（商业嵌入另取许可）；执行生产／自建工具最后排重；核对两份完整内容和签名流程边界，再按已有审核、授权、发布流程操作。共同tag若需UI筛选展示，属于现有字段投影限制，本次未扩大工程范围。

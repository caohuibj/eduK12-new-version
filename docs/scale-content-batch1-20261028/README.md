# 量表内容首批：ARS-30 静态注册

基线 main `642fda7ab754790686d6626efac62b73a332e663`，独立分支
`content/scale-structural-batch1-20261028`。本批只有一个工具、一个版本：
`ars30_2016_zh_cn_research:1.0.0`。不修改认知、共享治理、安装/发布引擎或工作流。

修改组件 → 必需检查：复用量表包并生成既有静态索引 → 选中身份结构与指导语冻结、
既有报告消费、DRAFT 安装拒绝及索引一致性。执行位置是本云端 Node/Vitest，
预算约一分钟；不跑全目录、整库类型/构建、数据库或 CI。

## 来源、改动和三部分结论

17 个包文件与配套文档来自固定 SHA
`b92c69aefa2472775fa7ee86b9c208366886c908`，沿用原路径，字节完全一致。
逐文件 source blob、SHA-256 和字节数见 [batch.json](batch.json)。
没有改写题文、公式、报告或版本，没有把 DRAFT 改成 PUBLISHED。
只生成原有静态索引，并增加三个本包接入用例。

| 部分 | 精确版本 | 结构结果 |
| --- | --- | --- |
| 题本/指导语 | instrument/instruction/localization 均 1.0.0 | 30 题、固定题序/选项、完整源指导语，语言及受众字段完整；注册身份与冻结指导语用例通过 |
| 计分/参数 | scoring 1.0.0；referencePolicy none | 通用引擎与原 golden 合同有效；总分及三个维度引用完整，无常模或分档，不补造阈值 |
| 报告 | report 1.0.0 | zh-CN、ADULT_SELF/student；四个指标有序、score_only、无 bands；完整与缺答结果可由现有协议消费 |

旧 main、固定 PR328 `fa355ff2dcd859b57a4bf2e8bddd77f8d428e3cf`、
PR362 `2612a9f5bf22c1370ec786f3d6feb50805003065` 均无这个 identity 路径。
既有候选盘点只有一个来源变体；本结论不覆盖未来分支，也不覆盖其他同名工具。

保留原有 PILOT、CANDIDATE、译审 PENDING、认知访谈 NOT_ESTABLISHED 和缺少
scientificReview 的真实状态；不新增审校人或科研批准。源文件原有的论文载体
CC BY 归属声明及署名文件原样保留，本次不是新的许可认定或作者授权。
导入的旧 validation 文档是原历史记录，不是这次执行结果。措辞质量和人工事项
原样列在 batch.json；没有用字数门槛或内容评价代替结构检查。

## 原始检查与复用边界

| 原件 | 结果 | 退出码 |
| --- | --- | --- |
| [selected-ars30.json](evidence/selected-ars30.json) | 2 PASS / 1 FAIL | subprocess 1，外层 1 |
| [selected-ars30-retry.json](evidence/selected-ars30-retry.json) | 仅失败项 1 PASS / 2 filtered | subprocess 0，外层 0 |
| generated-index | 一致 | subprocess 0；同一首轮外层最终为 1 |

首错是新增用例把注册器 schema 解析后的对象与未解析 JSON 直接比较。
只把该期望改为现有 schema 的规范化结果，并补同一个 schema 的 import；
不改源内容、不放宽业务校验。原测试字节保留为
[selected-ars30.original.test.ts.txt](evidence/selected-ars30.original.test.ts.txt)。
另外两个用例的函数体和 setup 未改；新 import 指向注册器早已消费的同一 schema，
应用字节均未改。它们保留首轮 PASS，不声称在 retry 中执行或已被正式 CI 接纳。

两份 execution receipt 包含精确 argv、时间、case fullName、报告/日志 hash、
实际检查退出码与外层状态。每次输入清单在执行前后采集（lossless gzip），
均一致；清单包含整个 backend/src 只是输入记录，不代表全部执行。
记录了锁、配置、schema、选定工具/Prisma 生成物和 Node 字节，未枚举完整
node_modules 或进程环境。原件未签名，最终接纳由 root 独立复核。
准备阶段的路径/预期文件数错误也保留在 batch.json，未写成验证成功。

本批不重跑根节点已完成的机制检查。新 wrapper 沿用现有类型断言模式，
没有改 API；三个直接消费者已执行。本批没有新的 tsc、SAST、构建、浏览器、
PostgreSQL 或全库 checker 结果，不能将原 main 的结果冒称本批执行。

## 真实状态与后续阻碍

源码仅在本分支静态注册，源仍为 **DRAFT**；catalog 仍为 **CANDIDATE**。
隔离数据库 materialize/安装、部署激活、正式公共库发布均 **未执行**；
公共库可见和可分配状态 **未建立**，无真实 capability 授权，未查写生产。
安装测试使用内存读替身，确认实际安装函数在 DRAFT 门禁处、事务与写入之前拒绝；
这不是数据库入库证据。

后续通过既有业务路径进行明确发布决策后，才能分别推进 source release、
内容 materialize、deployment install 和公共库 publication；本批不自动推进状态。
这些状态及审计必须按实际数据库逐项回读，不能仅凭源码注册宣称平台已安装。

APQ 的 ageMonths.maxInclusive 与现有 schema 不兼容；SPANE 的版本化 scorer
实际上存在于其 wrapper，历史 JSON-only 检查没有加载，不能称插件不存在。
两包的许可/公开再分发仍待人工处理，本批不复制全文、不注册、不改状态。
具体固定身份和后续缺口保留在 batch.json；不存在静默覆盖或编造许可。

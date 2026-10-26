# 验证记录与边界

本包为DRAFT/CANDIDATE源码候选；没有提交Git、推送、PR、CI、发布或部署。原题本与版权已核定，但专家译审PENDING、认知访谈与中国人群验证NOT_ESTABLISHED。

本地仅检查CHIME-S24单一工具，无全目录onboarding或全平台回归。

- 05:58:25首轮：18例中3通过/15失败；主要是QC时间写作+00:00而schema要求Z，以及测试误以为report轴改变内容hash。源报告准备时间和测试预期已修正；失败reporter、原source与测试字节保留。
- 05:59:37第二轮：18例中17通过/1失败。失败明确为旧expected.totalScoreKeys字段实际要求全部9个分数键；独立算术、漏答、非法值、年龄、版本轴和报告等已通过。没有把整次失败执行称为通过。
- 06:01:09受影响增量：修正全部9键，并把频率选项中文整理为“几乎从不/很少/较少/较常/经常/几乎总是”，只选源校验与8黄金，共9通过、0失败、9未选。其余9个既有成功case经源码与依赖影响审阅复用，详见validation.json与外部case-reuse-review.json；不是一次全18例新运行全绿。
- 06:01:09最终严格类型闭包：退出0；仅本测试入口传递闭包，330个输入文件的路径、字节数、SHA256在执行前留存，执行前后无漂移。前两次成功类型日志也保留，后续仅在输入变化时复验，没有改依赖或共享类型。
- 06:01:25实际引擎报告生成：退出0。对8组人工作答真实调用buildScaleResult并parseScaleResultV2，6份完整结果各有9段解释（合计54）；2份缺答结果quality=invalid且解释为空。report-results.synthetic.json为真实引擎合成输出，report-example.md选mixed_independent，不是真实被试。

覆盖：完整24题/固定序/6选项、五反向、八维各三题独立、作者允许总分的24题均分及无其他总分、1–6极值、混合/中间值、漏答不插补、缺失维度与总分null、非法/重复/未知作答拒绝、18岁门槛/未满拒绝/缺龄INDETERMINATE/非自评拒绝、独立版本轴不污染、9段primary summary均不少于100中文字符、无常模阈值/标签、许可与八轴61条tags。

版本行为：hashScaleDefinition在versionAxes存在时只绑定内容与计分，不含报告轴。测试确认报告版本变化不更改该内容hash，而题文变化会改变hash；reportVersion、scoringVersion和localizationVersion各自保持身份。当前none参数无独立运行时version，parameter-plan.json仅记录拟定参数计划1.0.0，不虚构引擎能力。

NOTRUN：本agent未注册generated索引、未运行DB/非owner事务安装、未自建DB、未运行浏览器/前端指导语展示、未跑CI、未发布、未上线。DB与统一注册由父agent后续负责；本记录不替代它们。PREPARED sidecar尚未接入旧schema的指导语消费者。许可标签不授系统使用权。

外部原始证据：/workspace/eduk12-scale-evidence/20261026-parallel/chime_short。含原HTTP来源与SHA、失败记录、三次原始JSON reporter/exit/log、源字节快照、类型输入清单、最终实际报告输入与输出证明。运行环境复用现有锁匹配依赖，未安装任何包；不是完整node_modules运行时字节签名。

最终source.json：71720 bytes，SHA256 6917748d9ac9a5c32f0deebd4c8793f2eda5b976269ac14cecaae1afadc0eb64。

## 父agent整合增量验收

以上NOTRUN记录该工具agent当时未执行的范围。父agent随后在本批统一原生成registry，对三工具共17条真实隔离PostgreSQL合同首次执行通过；以非owner应用身份从自有七工具dump恢复，旧7定义/9快照原样保留，新增幂等/回滚、实际持久化definition报告、快照不可变和未发布拒激活。三新工具均DRAFT/HIDDEN；最终10行/12快照，ReferenceSet与部署策略均0。未重跑agent已成功且输入未变的单元/类型或原始报告。

[整合证据](../../../batches/20261026-wave6-parallel/validation.json)记录源hash、继承的原始失败/复验、数据库及逐文件远端回读。产品HTTP/浏览器、独立指导语消费者、正式双入口、激活、CI与生产仍NOTRUN。

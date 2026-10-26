# OFS10本地定向验证

本次只验证ofs10_zh_cn_research@1.0.0研究DRAFT内容。基线HEAD24b826421e0546b8eb3f37fb02e2844218ade023；未修改旧包、共享schema、引擎、generated registry或依赖。

## 真实结果

- 新专用单测实际20/20通过，原Vitest JSON reporter保留，exit 0。覆盖严格source、10题顺序和完整五锚点、完整独立指导语档案、英西翻译选择、唯一总和与R6、9固定黄金向量、每题五个合法响应方向、任意单缺及全缺、非法/重复/未知值、成年/缺龄边界、独立版本与标签/许可。
- 新test及其依赖闭包严格类型检查只执行一次，exit 0，原stdout/stderr为空；没有全后端类型检查。
- 实际buildScaleResult并parse得到7份完整合成报告，每份1项解释；参数none，无ReferenceSet或分档。完整实际JSON与混合示例在本目录。测试mock shared instrument-registry以隔离其他工具；真实最终registry/数据库由协调器另行验证，本结果不代替该证据。

## 必须保留的输入取证缺口

预运行输入capture脚本有一个多余的`]`并报SyntaxError；shell未开启fail-fast，后面的unit和types仍实际运行并成功。**没有成功保存运行前完整输入哈希/原字节绑定。** 不能将后验清单补称运行前证据。原始检查reporter/command/退出码均不改写。

已把工具原错误输出摘录逐字保存为`capture-first.stderr.tool-output.txt`，并声明它来自原工具输出、不是当时redirect所得的独立stderr文件；`capture-failure.disclosure.json`保留根因及外层shell exit0/子capture数值退出未独立保存的事实。随后仅保存**POST_EXECUTION_UNSIGNED_NOT_PREBOUND**闭包清单和原字节。成功运行后source/test及其直接读取JSON未修改；协调器独立比较后验hash和最终Git字节，仅接纳为开发证据，不声称运行前已完整绑定。未为补证复跑已通过检查。

私有证据：`/workspace/eduk12-scale-evidence/20261026-wave8/ofs10`。

原记录：`commands.before.json`、`unit.reporter.json`、`unit.stdout.log`、`unit.stderr.log`、`unit.exit.json`、`types.stdout.log`、`types.stderr.log`、`types.exit.json`、`reports.synthetic.json`。后验输入：`inputs.post-execution.unsigned.json`、`input-blobs.post-execution/`。这些记录只关联本次实际运行，不覆盖/追认旧历史。

NOTRUN：PG/数据库、非owner权限、浏览器、CI、构建、部署、激活、Notion写入；集成/registry/PG另由协调器处理。中文人工译审PENDING、认知访谈NOT_ESTABLISHED、本地效度未建立；独立指导语仍仅PREPARED sidecar，不声称运行时已消费。none参数版本仍只有文档计划，不声称引擎已有独立参数身份。

协调器集成：本工具5项真实非owner隔离PostgreSQL检查，与另一工具共用2项前后状态检查；合计12项，不重复计为每工具12项。DRAFT/HIDDEN入库、冻结源、实际报告、激活拒绝均PASS。原12定义/14快照保持，最终14/16；无ReferenceSet/部署。详见../../../batches/20261026-wave8/validation.json。原agent的NOTRUN记录保留其执行范围，不替代此后协调器真实结果。

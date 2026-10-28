# BRCS范围验证

仅本工具内容合同、严格类型闭包及真实buildScaleResult合成样例；不等于DB/API/CI或上线成功。

- 最终source SHA-256：`68ae0f92da27333ee9b6b9f62bab7e4a98b6e2853910f8ad9fb9fafe2c972a66`。
- 严格作用域TypeScript一次执行，exit 0。其后唯一变更为qcReview.reviewedAt字符串从`+00:00`换成schema要求的`Z`，JSON对象结构、源码、测试和其他编译输入逐字节一致；承接已通过类型结果，没有重复编译。
- 单测首次18项：7通过、11因同一日期格式失败，原始exit 1保留。修该字段后只续跑11失败项：11通过、7主动跳过、exit 0。原7项和续跑11项集合不相交，合并覆盖18项；不声称第二次整文件18项都执行。
- 完整合法组合625种由单一合同逐项校验独立求和，不将组合数冒称625个Vitest用例。其他合同验证精确4题/数字中档、全缺失/每题缺失、非法/重复/未知回答、成人与缺龄边界、独立版本、版权与本地验证限制。
- 真实报告脚本首次因同日期错误exit 1，续跑exit 0；实际四题1/4/2/5→12，范围4–20，primary summary 181中文字符、reflection/strategy/support建议齐全，无参考集/分档/标签。样例JSON和Markdown均来自实际buildScaleResult，不是手工拼造结果。

共5次验证子进程（types 1、unit 2、report 2），2次原始失败保留为失败；不是5次成功。来源下载、只读检查与准备命令不计作测试成功。所有stdout/stderr、JSON reporter、起止/退出receipt及执行前原字节快照均在私有`/workspace/eduk12-scale-evidence/20261026-parallel/brcs4`；`validation.json`记录具体集合和清单SHA。前后41项输入只改变source.json的上述一个字符串；没有其他直接输入漂移。

独立指导语仅PREPARED_NOT_RUNTIME_CONNECTED；原schema不能消费instruction，未放入第1题。registry、隔离DB和远端提交由父流程单独负责，此处未实施。译审PENDING、认知访谈与本中文稿本地研究NOT_ESTABLISHED，无人工批准声明。

## 父agent整合增量验收

以上NOTRUN记录该工具agent当时未执行的范围。父agent随后在本批统一原生成registry，对三工具共17条真实隔离PostgreSQL合同首次执行通过；以非owner应用身份从自有七工具dump恢复，旧7定义/9快照原样保留，新增幂等/回滚、实际持久化definition报告、快照不可变和未发布拒激活。三新工具均DRAFT/HIDDEN；最终10行/12快照，ReferenceSet与部署策略均0。未重跑agent已成功且输入未变的单元/类型或原始报告。

[整合证据](../../../batches/20261026-wave6-parallel/validation.json)记录源hash、继承的原始失败/复验、数据库及逐文件远端回读。产品HTTP/浏览器、独立指导语消费者、正式双入口、激活、CI与生产仍NOTRUN。

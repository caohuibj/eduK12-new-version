# 验证记录｜IPS 2021发表中文版

source SHA256：f1f15cd10886356261fab9fb64b715a8ff7e6c34879bd82d60368a702941227c。新身份ips9_2021_zh_cn@1.0.0，DRAFT/CANDIDATE，没有scientificReview批准记录。

证据目录：/workspace/eduk12-scale-evidence/20261026-parallel/ips9。检查在共享工作树的后端目录执行；未提交/推送/开PR/运行CI/合并/部署；registry由父agent统一。

已执行：

- 独立原始来源比对：官方2021全文HTML Table1中9个英文、9个中文题干、题序与反向标志全部相等；仅移除排版断行，原ASCII逗号和空格保留。官方PDF与sidecar固定SHA256一致；HTML实际CC BY链接为4.0。原始输出primary-table/stdout.log、receipt.json，入口verify-primary-table.py与输入原字节均保留。
- schema与semantic source验证：staged-schema退出0，精确source与落入仓库文件字节相同；没有重复运行该相同输入检查。首次前置schema草稿误用maxInclusive，被Zod拒绝退出1；改为现有maxExclusive276后通过。初始失败source与工具chunk bd65d7身份留在initial-staged-failure；该前置失败未配置文件reporter，不伪称有原始文件stderr，原输出保留于工具会话。
- 自有新单元测试：20/20通过、0失败，命令只选ips9_2021_zh_cn.test.ts。覆盖9个黄金（最小9、最大45、中间27、全1原答21、全5原答33、混合25及三种缺失）、每题方向/等权、非法/重复/未知回答、唯一总分、真实结果构建、年龄上下界/缺龄/非SELF拒绝、测量/报告版本隔离、来源证据与八轴标签。own-unit.reporter.json及own-unit原始stdout/stderr/receipt保留。
- 仅该新测试/source相对import闭包的tsc --noEmit退出0，未运行全后端types/build。own-types/stdout.log、stderr.log、receipt.json保留。
- 真实buildScaleResult+parseScaleResultV2生成minimum=9、maximum=45、mixed=25三个完整合成结果，summary各179字符，报告版本1.0.0、范围9–45、无label/referenceVersion/ReferenceSet。实际产物report-results.synthetic.json、report-example.md；actual-report原始输出/receipt保留。不是数据库、浏览器或上线验证。

每个正式记录检查执行前均保存所列source/test/本地相对import、配置、package/lock、相关sidecar和检查入口的直接输入hash与原字节（inputs.json及inputs/）；测试/类型各40项。没有预先保存完整node_modules字节；事后environment-observation.json记录Node24.21.0、Vitest4.1.11、TS5.9.3、tsx4.23.12、Zod4.6.7与当前锁逐项相符，明确是事后观察，不追溯冒称完整环境签名绑定。所有结果ciExecuted=false、originalExecutionSigned=false。

未运行/待父agent整合：共享registry接入、非owner隔离PostgreSQL/HTTP生命周期、双入口UI、正式CI/上线。本包不能以静态/单元证据代替这些阶段。

已知功能差异：独立指导语仅PREPARED sidecar，现source缺instruction；none/score_only缺独立参数版本字段；年龄/SELF强制校验，大学生身份尚无结构化专用context自动核验。新中文端点/指导语/电子呈现和报告人工复核PENDING，不把源研究专家讨论冒称平台译审。科学范围仅源18–22岁大陆大学生便利样本，未绑定常模、诊断切点、轻中重或百分位。

## 父agent整合增量验收

以上NOTRUN记录该工具agent当时未执行的范围。父agent随后在本批统一原生成registry，对三工具共17条真实隔离PostgreSQL合同首次执行通过；以非owner应用身份从自有七工具dump恢复，旧7定义/9快照原样保留，新增幂等/回滚、实际持久化definition报告、快照不可变和未发布拒激活。三新工具均DRAFT/HIDDEN；最终10行/12快照，ReferenceSet与部署策略均0。未重跑agent已成功且输入未变的单元/类型或原始报告。

[整合证据](../../../batches/20261026-wave6-parallel/validation.json)记录源hash、继承的原始失败/复验、数据库及逐文件远端回读。产品HTTP/浏览器、独立指导语消费者、正式双入口、激活、CI与生产仍NOTRUN。

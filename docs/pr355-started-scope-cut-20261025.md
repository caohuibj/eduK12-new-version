# PR355 按实际开工状态收尾

边界：收到父dot关于“已开工收尾／本次闭环必需／其他未开工后续处理”的两条交接时，本地HEAD仍为74a61686ddd1d72224cde2e649d1e6f28ad0a836，工作树已进入下列入口接线实现。不是重新按理想功能拆PR；不push、CI、build或merge，待固定候选及独立review。

## 已开工，在355完成

- 已提交日常生命周期首片db225657、84请求证据aa12202f、许可退役整合7d8329f4和路线74a61686；此前浏览器WIP bdf424d保留。已有结果不等于新增差异已验收。
- 复用现有survey_tool_policies增加product入口维度：20261025120000_tool_entry_admission迁移、assessment-governance/tool-entry-policy、Survey策略读写和package join。没有新的版本库、MaterialGrant类别或356迁移。
- 系统入库/发布一次明确允许入口：library service review、registered Scale publisher、standard-triplet/governed审批及对应管理UI。现有C/P/R治理适配只保证Survey，明确拒绝/提示尚无Training组合适配；具备双端适配的公库自编量表仍支持Training/Survey。
- 正式入口管理员按入口资格分配；普通委托保留精确版本能力。admin-permissions/service返回同次已验证入口事实，library authority/distribution/usage及管理UI相应接线。
- 用户目录按服务端已授版本和入口范围过滤，过滤在分页前；管理目录按系统/入口管理范围展示。unified-catalog、listEntries、目录/分配页面及定向合同正在收尾。
- 版权退役残余和可选资料表单：library source及originalSjtArtifact中残余版权声明控制已移除；author/copyright元数据和表单改为可选，保留长度限制、媒体实际权限及来源使用/改编边界。

## 未开始但本次闭环必需，也在355补齐

- 新入口字段/策略不能使现有发布、真实试运行、选择和导入调用因旧夹具/调用体缺字段失败。最小修订直接调用者、CLI示例和整组合同；不借此接入新Training组合协议。
- 分配、绑定和新START必须核对服务端精确版本及当前禁令，不能仅隐藏按钮或相信visible/approved标记。补同入口、跨入口、错误版本、未准入Training和撤回竞态反例；在途仍用冻结绑定。
- 撤销/到期仍阻止受影响新入场；取消的是重复审批准入/签发人账户资格，而不是忽略已撤销的精确委托。相关锁顺序、回滚和旧响应恢复若由本次修改暴露则修复。
- 新字段/控件的实际前后端类型、完整定向测试组及隔离库迁移检查。下一候选不以名称过滤结果拼接为整组全绿；原失败与NOTRUN保留。

## 未开工，交后续356（编号按父dot解释）

- 新运行/审批摘要排除纯作者、文献、标签，以及涉及hashScaleDefinition两种历史行为、SCALE_MEASUREMENT_PROJECTION_V1/presentationMode的系统性分离。source-snapshot新增的scaleSourcePolicyIdentity目前只是为入口核对提取原指纹，尚未改变指纹算法；不能将这个wrapper算作新摘要改造已开工。
- 新的C/P/R机械兼容算法、从d7826bfe提取纯映射helper，以及Training绑定任意获批组合的消费者。当前只修改了审批允许入口，并未实现上述算法/消费者。
- 跨项目一次数据范围许可与读/导出收口：只有既有代码只读分析，没有生产代码改动。普通owner导出不额外造审批；现有权限保留。
- 每份作答去参数/报告模板正文复制、原始事实+少量规范结果/按需报告存储迁移。
- 新增Training/native/整包SQL资源测量分组、356性能候选整合；84请求旧证据仅绑定db225657。

三轴摘要和跨项目数据规则继续记录为后续目标，不因尚未实现而假称已完成，也不为扩充355先补象征代码。若收尾暴露它们中某个具体部分是现有改动的闭环必需，再逐项记录失败操作、最小修复和验收依据。

## 暂停备份检查点（2026-10-25）

用户要求将当前进度备份到现有GitHub分支，不触发CI。本次为未完成实现的WIP快照，保留上述范围、迁移、源码和测试修改；不表示已具备合并或发布资格。备份不恢复开发，不运行新测试、构建、CI或部署；后续正式CI仍须固定候选并经父dot独立review放行。

暂停时已读取原始本地日志：

| 完整定向组 | 实际结果 | 日志文件 |
| --- | --- | --- |
| 后端治理纯合同等21文件 | 182通过 | entry-admission-backend-contracts2.log |
| 前端直接消费者8文件 | 38通过 | entry-admission-frontend-contracts3.log |
| 公库治理PG完整文件 | 17通过 | entry-admission-governance-pg3.log |
| 治理目录PG完整文件 | 6通过 | entry-admission-lists-pg1.log |
| 全工具治理PG完整文件 | 12通过、9失败 | entry-admission-govtools-pg1.log |
| native治理PG完整文件 | 1通过、3失败 | entry-admission-native-pg1.log |
| 三轴发布PG完整文件 | 7通过、2失败 | entry-admission-triplet-pg1.log |

日志保留在本云端`/workspace/survey-followup-evidence/`，未将私有原始日志上传。以上执行输入和时间各异，部分通过后还有源码修订，不能合并统计为当前快照整组全绿。原较早类型检查也不能代替最终候选类型检查。

尚待归因和收尾：全工具及三轴PG已见`SURVEY_PUBLICATION_ENABLED`未显式开启造成发布拒绝和后续依赖失败；全工具还有正式管理员分配依据由工具授权ID转为入口资格后的旧断言。native失败涉及旧“立即阻断在途”合同，必须逐调用区分新入场拒绝与已入场完成，不得机械放宽全部拒绝断言。保留原失败证据，修订后需完整重验受影响文件。

尚未完成最终定向整组复验、最终类型/静态检查和本快照的新鲜浏览器验收。实际工作仍处于暂停状态；现有PR正文和旧CI记录中的历史语义不代表本WIP已验收。

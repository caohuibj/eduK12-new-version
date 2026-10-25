# PR355 日常发布与工具库治理简化

本轮基准为远端 `149441f908b57e67d53b55532206cc36b4b55580`。暂停时的浏览器修订已仅本地保全于 `bdf424d2724d3df87b4edb0788cd3ab1ba445947`，其中 Training HTTPS 验证仍有环境阻塞，不作为通过证据。后续只本地提交 `[skip ci]`，不 push、激活 CI 或 merge。

## 当前有效合同

- 账户资格审核一次；每次操作仍认证当前主体并核对项目/答卷归属。匿名 START 不重新审批发布者的账户、研究资格或 MFA 设置。
- 工具内容完整性、真实试运行和系统批准在入库阶段集中完成；批准同时指定入口。入口管理员分配本入口已准入的精确版本，受委托人员仍须具备精确委托能力。
- 选择/绑定由服务端从可用目录建立可信精确引用，不能相信客户端的可见、已批准或版本声明。授权/撤回是管理动作，不在每次作答重复审批。
- 发布一次检查技术结构、计分/报告、整包和批准组合并冻结。变更后形成新冻结发布；旧作答不追随 latest。
- 禁令阻止新 START，已有服务端作答记录按原冻结规则和原完成期限继续。Project/Wave、发布、版本和链接的停用必须在 START 事务内生效，不能只禁用按钮。
- 当前本人凭据、撤回/同意、归属、幂等、输入安全、冻结身份完整性仍逐操作验证。报告开放及数据范围不等于工具使用权。
- C/P/R 正文独立，使用明确确认的组合；新内容一次做机械兼容检查。作者/文献/标签只是可选参考资料，不进入审批指纹或运行过程；参数/常模的 REFERENCE 层不是文献。
- 普通项目可读范围内可导出；汇总权不包含原始明细。跨项目审计仍需一次明确项目/范围/期限授权，系统/工具管理身份不隐含数据权，不设双人审批。

以上禁令语义覆盖旧清单22和旧“立即停止在途采集”描述；历史证据保留原身份。

## 分片与验证

| 分片 | 当前状态 | 范围与验证 |
| --- | --- | --- |
| 已入场继续 | 本地实现并完成定向验证 | Survey 读取/存档/FINAL/native 公共锁边界移除工具准入重审；CLOSE/HARD_STOP 不改完成期限、不删除存档。Training 父 START 对所有量表依赖一次检查，条件子任务按已冻结候选创建；量表恢复/FINAL 不复查新入场禁令。 |
| 可信目录/入口分配 | 待后续实现 | 清理 START 中剩余旧使用权链；保留目录和选择/绑定时的服务端精确验证；入口管理员不再申请逐工具分发许可，普通委托仍精确。 |
| 入库与可选资料 | 许可退役片已本地整合并定向验证；资料摘要分离待完成 | 以 dot 精确补丁三方整合，保留本地生命周期修订；四份旧数据库合同按新规则验证。纯文献/标签与参数 REFERENCE 的进一步分离未完成。 |
| 共享 C/P/R 与批准组合 | 只读盘点，等待 dot 确认最小来源映射 | 不另造版本库，也不整体合入 PR356。 |
| 数据读取/导出 | 待核现有合同并实施必要差异 | 保持认证、主体/项目归属、原始明细与汇总范围区别及被试报告开放策略。 |
| SQL/资源配对 | 首批普通Survey已完成 | 同一发布/身份/答案的84个真实HTTP请求全部成功；进程复用完整序列SQL158→139，读109→92/写9不变/事务40→38。首次部分CPU/时延变差，不声称普遍提速。Training/native/整包尚未测；共享组合/版权成本另列，不与旧 d01/31d9 混作因果比较。 |

首片反例包含：停用在先/START在先、旧入口凭据等待锁、原期限到期、已有存档保存与恢复、FINAL 保留与精确重放、本人权限与冻结候选损坏。显式重启新 epoch 的新准入规则暂保留；School/Teacher 专属执行源及报告/导出规则本片未改。

本地通过证据与红/绿过程见 `evidence/survey-governance-followup-20261025/daily-lifecycle-core.json`。PG 命令只选了8个用例；35个按名称过滤，不能声称完整集成套件通过。没有运行新 GitHub CI。

## PR356 最小复用映射（尚未移植）

只读参考 `fix/runtime-time-and-validation-20261025@d0a05871d9d79672fd5fa882a23f99167bb5a87b`：

- `d7826bfe`：`measurement-content/standard-combination.ts` 的公共精确组合映射；当前355已有 Survey `standard-triplet` 和不可变 measurement releases，但尚无此公共组合消费者接线。
- `be67440f`：Training 精确组合引用与冻结合同，需连同其实际 schema/迁移依赖核对。
- `29f22d65`：同事务 `standard-combination-content/source` 不可变正文复用；只在上述模型接入后复用，不建立跨请求权限缓存。
- `f74c9bad`：Training 的组合使用与21B分配接线；必须按本轮“入口资格分配”新决定适配，不能原样复制旧能力门禁。
- `c370bdc2`：实际 Training 发布、内容绑定、收集和报告消费者。覆盖 `composite.service`、checkpoint、content-binding/final/report、reference/report selection、whole-questionnaire；与本片同文件，需要逐段适配。
- `e2f4b0ef`：旧权利检查锁等待修订。版权控制将由 dot 删除，不能将其当前权利链直接作为本轮目标语义。

dot 确认依赖闭包及许可适配前，不 cherry-pick 整段 PR356，也不把该分支功能记为当前355已具备。

## SQL 审计边界与预算

采用同一合成 fixture、发布、身份、答案和请求边界，基线/候选使用隔离克隆库避免重放被误当成新作答。首次与后续请求分组、少量配对重复。按 START、保存/FINAL、父推进、报告生成/读取、持久化归类；没有独立推进的协议明确记不适用，不造新请求。

分别记录读/写/事务控制总量，标出资格、工具使用权、版权和重复版本查询；分类可重叠时单独说明，不能把分类之和当总数。发布一次成本单列。同步记录完整请求结果、时延、CPU、峰值RSS、DB上下行字节和每份存储字节。失败或未执行阶段保留状态，不计成功全链，也不以SQL减少宣称普遍提速。

首片局部检查预算约30分钟，后续资源探针预算约15分钟；依赖适配和新失败另行报告。只使用本任务合成库，不改真实数据/时区，不压力测试、不部署。

首批HTTP/SQL/资源结果和复用边界见 `../server-version/perf/current-main-v1/daily-publication/README.md`；本片尚未包含随后收到的许可补丁。

## 许可退役整合检查点（仅本地）

收到 Library v0 补丁后先核对84855字节及ZIP/patch SHA-256，独立149441f9 worktree的apply-check通过，再于aa12202f以`git apply --3way`整合89文件；88文件与交接manifest完全一致，scale-admission保留本地已入场规则。随后只修直接消费合同。无schema、migration、runtime-role-policy、workflow或依赖变动；测试库执行的是现有229次迁移。

新增部署写V2及DEPLOYMENT_IDENTITY，不带版权许可字段；历史V1只读并严格核原hash。版权台账API返回410，仓储写在访问数据库前失败，相关入口退役。MaterialGrant、入口/角色、科学范围、媒体和数据ACL不受版权退役影响。

新数据库合同保留两类相反证据：部署撤销仍与发布串行、拒绝撤销后的新发布；版权历史元数据过期/撤回不阻断新发布或已入场。另验证实际release插入后异常回滚、部署退休后写入失败回滚、精确重试/版本冲突、并发恢复、年龄/问卷context、严格回执和完整FINAL保存。历史版权记录仅作为合成只读资料，不制造新的审批或权限。

去重后，后端29个纯合同文件300项、前端8文件106项和4个PG文件22项分别通过。PG是失败归因修订后的用例级合格证据集合，不是一条完整suite全绿命令。前后端实际tsc通过，路由158项一致，前端改动lint零错误、3条原有ref cleanup警告。完整命令、原始失败/修订映射和log hash见`evidence/survey-governance-followup-20261025/license-retirement-integration.json`。两个后端`typecheck --if-present`空执行明确不计入，已用直接tsc补齐。未新跑浏览器、build、全量回归或CI，未push/merge。

普通项目导出当前经analytics.export.service的owner与MFA边界，没有逐次人工审批；系统跨项目查阅当前仍可凭本次审计receipt读取，导出去标识另有项目/范围/期限grant。后者尚未完成本轮“一次明确数据范围权限”的收口，不能将现有系统身份与审计直接称为目标项目授权，未擅自放宽。

84请求原探针的实际冻结publication已只读核验：一份单题SINGLE FORM和一份自编描述性SCALE（两题五级选项、一题反向、两个维度），fixture/result/数据库definitionDigest一致。它不代表注册公库量表、native/认知、整包或完整混合协议；只绑定db225657，不能给这次许可整合继承数值。

## 后续接线的最小边界，供dot统一选择

继续只读核对PR356后，具体依赖为：

1. 公共组合映射/正文：`d7826bfe`的`measurement-content/standard-combination.ts`，以及`be67440f52dba90576e3640a8d3987ae5b7d7c19`、`29f22d656471e67a43d2d4f1b6e2c202949d1732`中的`standard-combination-source.ts`、`standard-combination-content.ts`和Survey模型接线。355已有`retainImmutableCanonicalValue`及measurement hashScheme，不需要重新建立这两套基础合同。be674本身没有schema/migration，不能将其描述成已带齐数据库模型。
2. 用户精确组合引用：`f74c9badf0a454ba15e7c3aa43d0fbb2babd22c8`带4个迁移（`20261025070000`至`20261025070300`）、MaterialGrant类型/字段及`standard-combination-use.ts`。必须适配而非原样搬入：该版本请求/receipt仍要求grantId/authorityGrantId，数据库CHECK也要求authority_grant_id非空，与本轮正式入口管理员无需逐工具委托许可冲突。应保留普通委托的精确能力及FK/不可变性，明确记录入口资格或精确委托两种已验证签发依据，不能仅删非空检查或把ONLINE当Training准入。
3. 实际消费者：`c370bdc2`中的发布、Training组合/普通问卷绑定、FINAL、reference/report-selection及报告读取接线。355的composite与checkpoint已改为入场后按冻结规则完成，需逐段接入；不得复活逐操作当前issuer/工具审批链。`standard-combination-source`的同事务不可变事实复用可以保留，但其current状态判定要与绑定/新START和已入场执行的职责分开。
4. 不纳入：`e2f4b0ef`的版权控制、其他标签/分类/旧性能成绩、整段356全量变动。以上来源尚未移植；先由dot决定来源闭包，避免两个PR重复实现/冲突。精确组合引用本身也不证明每份答卷已去掉参数、模板全文，后续仍需核实际runtimeSnapshot与结果保存内容。

目录/分配的反例清单已明确：全局ONLINE但未选Training入口须拒绝；正式本入口管理员可分配本入口准入版本，不能跨入口；普通委托仍需精确版本能力；使用者目录仅列已获权精确版本；客户端伪造可见/版本/批准标记拒绝；第26条及筛选后续页不能丢失；授权撤回阻止新START但不截断已入场。批准入口与组合版本应使用现有治理事实，不另造第二套版本库。

数据权限的剩余差异不是普通owner导出审批：`system-data.service::viewSystemSurveyAnswers/viewSystemSurveyReport`现通过当前SYSTEM_ADMIN和本次审计receipt读取，没有一次明确的项目/数据范围许可；去标识导出才查`survey_system_export_grants`。后续应沿现有项目授权记录收口读/导出范围，保持去标识/原始明细/汇总权区别及MFA、撤回、到期与最终授权检查。不把现有DEIDENTIFIED_EXPORT擅自扩成有标识原始数据读权，也不以移除current认证代替去重复审批。

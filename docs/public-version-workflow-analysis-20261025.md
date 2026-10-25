# Survey / Training 公共版本流程：现状、最小收敛与验收

## 结论与交付状态

本轮从 #355 候选加 #356 三补丁的精确集成基线继续，不把它称为合格 main。
两入口已经复用 `measurement-content` 的不可变发布仓储、测量投影和声明式报告渲染器；
缺的是共同组合事实的登记、入口消费和管理状态，不能通过再造一套仓储解决。
Survey 标准组合 ONLINE 仍不能证明 Training 完成同一 C/P/R 的精确分配。

已完成一个独立小块：提交 `057f03da99c9015f18a2c9880d61e62155873da2`，
Survey 波次预检现在提前显示当前项目修订的测量发布缺口，使用冻结时相同的身份解析，
不生成发布记录、不自动批准，也不增加 FORM 或现有冻结时物化路径的手工步骤。
本块只减少“预检通过后才发现必须补发布”的返工，没有取消真实版本保护。

基线与映射见 [集成记录](tool-onboarding-next-20261025.md)；
检查结果见 [preflight-validation.json](evidence/tool-onboarding-next-20261025/preflight-validation.json)。
下文的结构方案和验收是后续工作，尚未实施；不增加原 Notion 的 23 问题/55 计划统计。

父对话 dot 独占：36 工具的自编来源/外部许可豁免、P/R 文案与身份修订、中文标签与分页前搜索，
以及全部实际数据库安装、正式发布、合成试运行。本节点没有执行这些业务操作。

## 一条流程中需要区分的事实

| 阶段 | 必须回答的问题 | 当前事实来源 | 不能从上一阶段推导的事实 |
| --- | --- | --- | --- |
| 工具准备 | 来源、可执行内容、参数和报告分别是什么版本？ | registry/source、原编制编辑器、axis snapshot | source 的 PUBLISHED 不是正式 DB release，也不是科学效度结论 |
| 正式入库 | 哪些精确不可变实体已真实发布？组合批准和试运行是什么状态？ | measurement_content_releases、标准/通用治理 release | 入库不产生入口或用户 grant；正式发布默认 HIDDEN |
| 入口分配 | 哪个入口准入、谁可以向哪个主体分配哪个组合？ | entry policy、当前管理员资格、精确目标 grant | Survey 准入不授予 Training；标题/标签不授予任何权利 |
| 冻结 | 当前项目/问卷究竟用了哪些版本？ | 项目测量发布、publication、content/reference binding | 私有模板发布不等于项目发布；preflight 不能代替写事务重验 |
| 作答提交 | 当前凭证和范围是否仍可采集？重复 FINAL 如何复用？ | 入口守卫、停止记录、receipt、事务与幂等键 | 一般下架、紧急停采和历史读权限不能混为一个状态 |
| 报告反馈 | 原始事实与解释用的精确 P/R/生成器是什么？谁能读？ | 保存的解释/规范结果、release 指针、当前披露规则 | 新组合不追溯替换旧冻结；保存了报告不代表任何身份都可读 |

共同流程应共享上述事实类型和必要校验。真实产品差异放在适配器：FORM 不计分、认知/SJT 的协议与作者限制、
课程/项目范围、参与者和研究者报告受众。不因流程共用而开放新的编制权或跨入口私有数据。

## 已核实的缺口及最小改法

### 1. 预检遗漏正式项目测量发布：本轮已补

基线 `waves.service.ts:215` 的预检只验证结构/同意/媒体等；
`publication.service.ts` 的 `resolveSurveyMeasurementUnit` 在冻结时调用
`requirePublishedContentRelease`，才要求同 owner、project、revision、内容身份的 PUBLISHED 记录。
结构正确的私有 SCALE、COGNITIVE、SJT 和需要显式发布的目录 SCALE，可能先收到 ok，再在冻结被合法拒绝。
这是反馈晚，不是精确版本校验本身有错；对应 IN-02、VMI-010/014。

本轮新增内部 `surveyMeasurementPublicationMode`，预检和冻结共用原有规则：
FORM 无测量发布；普通原生测量及相应目录 SCALE 显式发布；原有 catalog/package 在冻结时物化的分支保持原方式。
预检按工具标题和当前修订给出实际失败原因；正式 release 缺失、停止、身份变化均不能显示通过。
未知异常/数据库失败仍抛出，不误报成“请补发布”。冻结仍在其原事务和锁中重新解析，预检结果不是凭证。

改动仅两个后端服务及一个测试文件，没有改父对话的来源、报告、标签或入库逻辑。
不声称预检已覆盖冻结的所有预算、参数、报告及并发条件。

### 2. 同名“已发布/可用”跨越多层事实

`scale/onboarding/materialize.ts` 物化 Scale/AssessmentReferenceSet；
`scale/onboarding/publish.ts` 真正发布 MEASUREMENT 和 Scale 状态；
`survey/standard-triplet.service.ts` 另外维护标准轴和组合；
`scale-library-governance/service.ts` 维护自编共用库申请/entry。
`scale/library/scale-library-read-model.ts` 的 availability 仍包含静态 catalogStatus、源包状态、部署和来源条件。
这些字段不能互相改写成成功；静态科学成熟度也不应冒充已完成或未完成的数据库操作。

最小收敛先扩展现有管理读模型，分别列：source 身份、已安装对象、正式 release 指针、组合状态、
各入口准入、目标 grant、当前项目发布/冻结。每个缺口指向真实动作和 responsible scope；
未读取/没有证据显示 unknown，不从空页面推断数据库丢失。不新增每工具一轮审批。
来源和许可判定直接消费父对话的可信实现，第三方/未知来源保留真实许可约束。

### 3. 统一目录还没有统一组合消费

`scale-library-governance/unified-catalog.ts` 自己明确是只读目录，标准项来自 registry 投影；
`standard-triplet.service.ts:90/142` 的批准/ONLINE 审计 scope 为 SURVEY_ONLY；
`standard-triplet.catalog.ts` 解析 survey-standard 精确组合；
Training 的 `composite/training-content-binding.ts:22/42` 解析自己的 Scale/config/SJT 源指针及 reference/report。
当前不能证明同一标准组合 release 被双入口共同选择和冻结。

最小收敛应复用现有 release 引用作为共同组合事实，明确 C/P/R 与实际 MEASUREMENT/REFERENCE/REPORT
的映射及兼容规则，再分别提供 Survey/Training 适配。先做只读解析与合同测试，再接入口消费，
不把 Survey 专属 grant、PRIVATE scope 或 ONLINE 直接传给 Training。当 C/P/R 中某轴显式不配置时，
应保留明确空轴事实，不能凭目录省略字段判断为空。

### 4. 新轴的合法登记仍未闭环

`standard-triplet.service.ts:36` 的 partsFor 只合并注册来源与已批准数据库轴；
`standard-triplet.routes.ts` 提供选择/预览/批准/重试/撤回，没有任意新轴 payload 作者端点。
选择现有 none-v1 是合法配置选择，不是创建 P2 或 R2。

先明确沿现有编辑/正式导入/代码包怎样产出候选轴，再接登记、结构与计分验证、兼容检查及批准。
认知/SJT 继续原后台代码包或正式导入路径，普通用户不因统一而获准编制。
R 修订不重编 C；P 标签确属参数内容时真实产生新 P，数值和旧身份保留。
本节点等待父对话修订成果，不重写 36 项源包，不用直接 SQL、假 registry 或假科学声明补齐。

### 5. Training 21B 要连同发现和历史 grant 重验一起收敛

`scale-library-governance/authority.ts:15` 中 Survey material.distribute 认可当前入口管理员；
Training 仍要求精确 capability grant 并校验入口角色，与用户已定 21B 有差异。
仅在这里放开一步会留下其他不一致：`libraryCapabilities` 只投影精确 grants，
`distribution.ts:listUses` 也按这些 grants 过滤；`usage.ts:assertLibraryUseGrantCurrent` 会再次校验原 issuer。

后续最小包应同时处理四处：当前入口资格与准入版本的分配判定、能力读模型、授权列表范围、
既有 grant 的当前 issuer/资源范围重验。正式 Training 入口管理员按已准入精确版本分配；
普通委托人员保留精确能力，目标教师仍需合法 grant；系统管理员不能代替入口管理员。
reference.review、report.edit/publish、数据范围和科学权不能随分发身份扩大。
本轮未改这些权限路径；验收需要独立身份矩阵和撤权竞争，不以目录能看到替代。

### 6. 每项目物化 P/R 是真实复制点，但 scope 保护不能直接删除

`survey/standard-triplet.content.ts:12` 的 copyTripletContent 按目标 measurement 的 releaseId 创建
REFERENCE/REPORT；报告 key 与目标 measurement 绑定，scope 取目标私有 scope，模板正文随 release 保存。
同一个批准组合被不同项目使用时，不能据此声称已共享一份 P/R 正文。
但 `survey/content-selection.ts` 明确要求 owner、product、project 和精确 measurement 匹配；
直接去掉 PRIVATE 约束以复用对象会串权。

先统计同一组合跨项目实际复制的字段和体积，区分“授权/绑定事实的必要新记录”与“正文重复字节”。
若确需改层，保留不可变正文和内容身份，另以轻量绑定引用表达各项目 scope；共享内容寻址不授予读取权。
优先复用 measurement-content 仓储，只有实证表明现结构不能表达时再提出兼容迁移。
旧快照、P/R hash、receipt 和历史解析协议保留，不默认重写全部冻结记录。
本轮没有连接数据库或测量存储体积，未作收益定量或物理迁移结论。

### 7. 按需报告已有部分实现，不应从零重写

`composite/training-content-report.ts:25` 已使用保存的 FINAL 事实和解释，按所选精确 release 调用
声明式 renderer；不重选 reference、不重计分。`assessment-runtime/compact-assessment-storage.ts`
已存在规范事实/结果引用和批量读取。Survey 的 `final.compute.ts`、`final.service.ts`
及治理工具报告仍保存各自结果结构，需要逐字段调查，不可把所有结果都称重复全文。

先复用已有“原始答案＋规范结果＋精确解释/生成器引用”，比较剩余正文写入点，
只有必要处改为按需渲染。本轮不默认新增 worker、异步队列、ordinary 协议或另一份正文库。
没有清理旧答案、报告或数据库。

### 8. 正式发布、停止和历史读取需保持独立

`scale/scale-access.ts:31` 对 PUBLISHED+PUBLIC 的 STANDARD 提供学生访问路径，
因此公库正式发布采用 HIDDEN，入口/目标 grant 后续显式分配；不能用 PUBLIC 让“入库完成”变成全员开放。
`collection-guard.ts` 的停止检查绑定精确 release/源依赖并通过原事务锁保护。
`usage.ts` 说明新使用与冻结运行的语义不同；不能用更宽的目录可见性替代停止守卫。

历史报告撤回后是否继续可读尚未决定。本轮保留现状，包括 Training 独立报告 participant 空结果、
REVOKED 项的 null/状态和 receipt 保存；不新增全部可读/全部停读，也不改变系统导出无双人审批的规则。

## 最小可审查的开发顺序

| 块 | 交付与前置 | 必需验证及其要发现的故障 | 主要执行位置/复用 | 预算 |
| --- | --- | --- | --- | --- |
| 已交付 | 预检同冻结的精确发布判定 | 缺当前 revision、错 owner/project/hash、停止版本、FORM/目录路径误加步骤、意外写入 | 本云端定向测试；原通过输入不复跑 | 本次已完成 |
| 下一块 A | source→release→combo→entry 的只读映射与真实阻塞说明；接父任务可信来源读模型 | 源声明被误当正式发布、旧状态覆盖真实事实、ONLINE 被误当 Training 分配、标签串权 | 先本云端纯读模型合同；保留父任务实测原身份 | 约 1 个 20–30 分钟调查/定向实现块，范围冻结后调整 |
| 下一块 B | 共同组合引用解析及 Training 适配，先调查再决定最小 schema | C/P/R 单轴切换、未知/错工具/错计分/错 metric、私有范围、旧冻结不漂移 | 本地缺失合同；需 DB/HTTP 时由父任务协调独立主执行位置，不能重复入库 | 范围待 A 后实证确定 |
| 下一块 C | 21B 的分配、能力读模型、列表和旧 grant 当前身份重验 | 入口管理员/系统管理员/委托人/目标主体隔离、准入与范围停止、竞争撤权 | 单一有界权限验收；输入不变复用已核记录 | 独立权限变更，不混入本轮小修 |
| 最后评估 | P/R 正文复用与剩余报告按需渲染 | 完整答案与规范结果保留、精确旧报告回放、隐私、失败恢复及重复 FINAL | 先只读规模证据，必要才迁移；不默认队列/清库 | 无存储测量前不承诺收益或工期 |

最短合法路径的目标是：可信准备→一次共同版本核验/正式入库→入口准入与目标分配→
项目精确选择和冻结→现有事务性提交→精确版本报告反馈。UI 可把有依赖的动作组合呈现，
但不能把系统批准、入口分发、科学编制/发布和私人数据访问合成一个万能身份。

## 验收矩阵与责任

1. 共同身份：两入口读同一组合的精确 C/P/R 指针、来源和 hash；实际入口可用/不可用分别验证。
   同内容重复登记幂等，同版本异内容拒绝，不使用标题/latest 匹配。
2. 来源隔离：父任务提供可信自编成果后接入其读模型；第三方缺授权/过期/撤销仍拒绝，客户端 self_authored 或分类标签不改变权利。
3. 版本迭代：通过合法作者/导入路径分别产生 C2/P1/R1、C1/P2/R1、C1/P1/R2；另两轴不变、组合身份变化。
   暂无作者入口时记前置缺口，不伪造版本。旧冻结/旧报告保持旧绑定。
4. 分配角色：SA、Survey 入口管理员、Training 入口管理员、委托人、两位研究者、两位教师分别测试；
   正式准入不替代目标 grant，跨入口 grant 不互通，科学编辑/发布与隐私读取独立校验。
5. 预检与冻结：本轮已用内存 SQL 双替身验证精确发布缺口及无写入；后续实际 HTTP 由父任务协调，
   使用已有精确对象，只补缺步骤，不为复跑重新安装/发布。预检后修订变化、撤权或停用时，冻结仍拒绝。
6. 提交与停止：已有幂等 receipt 不重算；相同 requestId 异 payload 拒绝；停止与新 FINAL/采集竞争仍原子，
   不把重试复制成新答卷。范围撤回的实际作用由精确资源守卫测试证明。
7. 报告与存储：核对 P/R/生成器、原始答案、少量规范结果、按需正文；不能从未测均分推断原因或诊断。
   本节点不重做父任务 36 份语义审校，也不将 10 份项目参考/26 份理论范围称全国常模。
8. 故障分层：逐项记录 API 真拒绝、脚本主动停止、夹具/环境错误、前置不足、未知写入结果和未执行。
   不把未发出的请求记成产品拒绝；不把成功单测记作 DB/HTTP、CI 或部署通过。

实际安装/正式发布/合成试运行全部在父对话 dot；代码交接不会转移这些任务。
本报告未安排新的 live 数据库验收、CI 或生产动作。

## 本轮实际检查与保留失败

- 25 个新增用例：第一次 23 通过、2 个新夹具错误；只修 FORM 的字段/type 与目录缺失的 sourceVersion，
  仅复验这两例通过。保留首轮失败，23＋2 为不相交结果，不声称整文件在第二轮重跑。
- 四份既有消费者测试中 38 例通过、11 例失败，命令本身失败。11 例均来自
  `measurement-content/survey-content-binding.test.ts`，旧 SQL 替身把 attempt 行当作递归 release 依赖结果，
  精确祖先守卫拒绝“量表依赖身份不完整”。
- 用 `git archive` 导出未含本次改动的集成代码 `6fedb640...`，使用相同依赖仅运行这 11 例，
  同名 11 例及首条错误全部一致。确认为本次独立小修前已存在的候选失败；本节点没有修该测试或守卫。
  不把它外推为生产故障，不抢原 #355 收尾工作，也不能称基线全绿。
- 后端生产 `tsc --noEmit --pretty false` 退出 0。新测试定向类型首轮因漏带项目原有 Express augmentation
  报错；补上 `src/middleware/auth.ts` 这一原输入后同命令退出 0。没有改类型、测试断言或生产守卫。
- `git diff --check` 通过。未运行前端构建、全量回归、镜像/扫描或 CI；这些未运行项不冒充资格。

测试仅合成定义/内存查询替身，没有真实参与者数据、实际业务写入或数据库连接。
已按锁文件从官方 npm 源恢复依赖并执行 Prisma generate；未执行安装器的 migrate/seed/build/start。
直接输入哈希和原始报告/日志哈希保存在验证 JSON，不是完整传递环境字节或签名证明。

## 仍需明确的业务问题

- 历史报告撤回后：按哪一对象/范围停止读？摘要、明细、导出和既有缓存如何一致？决定前保持现行规则。
- Training 独立 REPORT 的受众目前是 teacher/researcher，participant 返回空；未来公共 R 的参与者反馈
  是沿既有反馈协议还是新增受众，需要在该块实现前明确，不能借共享正文自动开放模板或数据。

这两点不阻塞本轮基线、静态分析和只读预检修复。新轴编制身份、可信来源及正式 HIDDEN 发布等已有要求
按用户现行授权执行，不为这些已定规则重复请求批准。

## 来源与交接

- [下一轮详细需求](https://app.notion.com/p/404d27635a38810dbd19e1f820bd37bf)：IN-02/03/04/10/11。
- [原验收总报告](https://app.notion.com/p/404d27635a388145af7dd8c03bd8c842)：VMI-003/004/010/014/016/017/018，以及 VM-A04、B03/B06/B08、C02–C10、E07、F02/F06/F07。
- 源码审查定位以本分支精确提交为准；未上传的新提交不能当作 GitHub 可访问链接。
- 不推送、不启 CI、不合并、不部署。等待父对话提供可核验成果，仅集成必要代码；
  #355→#356 实际合并后按 [对齐规则](tool-onboarding-next-20261025.md) 识别已引入补丁，避免重复 cherry-pick/force push。

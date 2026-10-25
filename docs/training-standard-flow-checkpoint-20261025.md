# Training 共同版本消费：第四块阶段检查点

本轮已接入真实服务调用路径，并以隔离 PostgreSQL／HTTP 验证局部发行、拒绝和存储合同。
**尚未取得“教师合法使用权 → 固定组合 → 发布 → 学生作答 → 规范结果 → P/R 消费”完整正向样例。**
不能把下列合成局部场景、内存边界合同或代码接线等同于该纵向样例通过，也不是成功的 #355 基线或 CI 资格。

## 提交和上游

- 起点仍为第三块 `7ca5dace9d91602172b15c577fd472bcc34e704e`，没有更换原 #355＋#356 集成基线。
- `29f22d656471e67a43d2d4f1b6e2c202949d1732`：共用正文生产器、严格组合指针、事务内不可变事实复用。
- `f74c9badf0a454ba15e7c3aa43d0fbb2babd22c8`：现有 21B 分发权、一次用户使用权及撤销／重新发行的版本保护。
- `c370bdc2ff767d48bee554ae4565ccd572446957`：Training 选择、发布、运行时、收集、原始整卷接收与 P/R 消费接线。
- `e2f4b0ef850a10b3f2e3f12a29c7ddfac6b46b78`：共享 P/R／材料锁等待后的末尾当前权限与许可复核。
- 本轮代码 tree 为 `501694053fd2a771ef3120cabb3d1e81a85b6ca3`；分批提交的检查针对总工作候选执行，不声称每个中间提交独立取得整体验证。末尾发布复核已有最终类型检查，真实发布等待场景仍未运行。
- dot 五提交与较新 #355 候选尚未集成到本节点；原始 cherry-pick 来源映射及原 11 项失败证据保持不变。

## 已修订的授权合同

原第三块的“旧 canUseScale ＋ COURSE content-capability material.use”双重要求已移除。
原不可实际签发的 `/:id/standard-combination-source` 预检接口及对应独立服务删除，现有 add／preflight／publish 消费实际来源。

组合身份是既有不可变组合 UUID，hash 只绑定完整性。不会把
`standard-combination:UUID:hash` 引入通用资源键协议，也未修改通用 content capability 的 scope／capability schema。

发行继续复用 21B 的现有合法合同：SYSTEM 签发给当前 TRAINING 入口管理员的
`PLATFORM / scale-library-governance / material / [正式 C UUID] / material.distribute`。
SYSTEM 不能代替入口管理员分配使用权。入口管理员使用这一分发权给当前合格教师分配
一个 `MaterialGrant(resourceType=STANDARD_COMBINATION, resourceId=组合 UUID)`，记录组合 hash、原始分发 root 和 issuer。
**同一教师同一组合跨本人课程复用同一个使用权；课程仍核实真实归属，不增加课程审批。**

这替代新路径原来的旧 Scale 使用权检查，不要求再签第二个课程凭证，也不自动补任何 grant。
授权仍检查目标教师资格、入口管理员当前资格、原始 root 的目标／内容／入口／时钟／撤销状态、当前组合状态、精确来源和紧急停止。
第三方真实版权约束仍在新引用／发布／START 的既有部署策略与授权解析器检查；没有用分类、PUBLIC 或客户端 self_authored 绕开。

使用权撤销不再物理删除记录。`version` 与 `revoked_at` 受数据库触发器保护；显式重新分配需确认撤销后的版本，版本继续递增。
冻结引用包含 `useGrantId + useGrantVersion + issuerId + authorityGrantId`，旧引用不会因相同 UUID 被重新分配而复活。
重复发行 requestId 读取原操作回执，不重新激活后来撤销的使用权；该发行正向回执分支仍待合格组合 fixture 验证。
沿用既有公库政策允许 SYSTEM 紧急撤销，SYSTEM 仍不能分配；未引入额外管理员角色或独立课程审批动作。

## 实际接入的路径与尚未证明的部分

| 阶段 | 代码接入 | 本次证据与限制 |
| --- | --- | --- |
| 入口发行权 | 既有 `/api/admin/permissions/content-grants`，原通用 schema | 真实 Express、认证／CSRF、PostgreSQL：SYSTEM 发行成功，入口越权及 CSRF 错误拒绝；签名会话为隔离合成 fixture，未执行浏览器 MFA 登录 |
| 用户使用权 | `POST /api/questionnaire-products/standard-combinations/:combinationId/use-grants`；撤销接口 `POST /api/questionnaire-products/standard-combination-use-grants/:grantId/revoke`，body 为 expectedVersion／reason | 未试运行组合的真实 HTTP 发行拒绝；真实 SQL 版本撤销与不可变记录通过；合法 ONLINE 组合的正向发行尚未运行 |
| 教师选择 | `resources.standardCombinations` 返回已拥有组合；现有 `POST /:id/items` 的 SCALE item 可携带严格 `{releaseId, combinationHash}` | 保存 `CompositeAssessmentItem.standardCombinationSource`，无课程 grant；55 个真实领域守卫＋内存 SQL 边界合同通过，真实正向选择未运行 |
| 预检和发布 | 现有 prepare／publish，预检只读；实际发布事务机械派生共享 P/R 正文 | 不再增加 P/R 审批或每课程正文副本；真实正向发布、共享正文并发／幂等与回滚未运行 |
| START | 同一批准 definition 和已有精确 native P；冻结轻量组合／C／P／R 指针 | 不读取注册包默认 P/R，不自动装缺失 native P；当前已安装 C 不匹配或 native P 缺失会拒绝。真实 START 未运行 |
| 收集与 FINAL | child create／delivery、checkpoint、单项 FINAL、批量 FINAL，以及整卷 RAW 接收事务 | 当前使用权、原冻结组合、入口、C 和紧停复核接线；真实新学生 FINAL／并发撤权未运行 |
| 整卷可靠接收 | registerWholeQuestionnaireReceipt 的事务内内部回调；有标准来源时不走不能运行该回调的原子 SQL 快路 | 真实 SQL 证明回调拒绝整体回滚，已接收回执先于新使用检查回放；这只是存储接缝合同，不是合法量表作答样例 |
| 已接收整卷处理 | 内部 worker 用匹配数据库 job／parent／epoch／submission／acceptedAt 的当前 lease，原有后置 lease 复核保留 | 原始答案已接收后不把报告排队变成新一次用户使用；仍核对原冻结来源、当前组合状态和紧急停止。该标准来源 worker 分支尚未取得真实纵向验证 |
| P/R 消费 | 限定在携带已验证标准来源的单位上，验证共享派生 P/R 的原始组合及正式 C；其他私人／正式常模分支保留 | 7 个串权边界＋80 个受影响既有消费者合同通过；真实标准工具 FINAL 及 Training 报告读取未运行。参与者开放策略及历史可读政策没有重定 |

精确组合收集同时检查实际 item 和冻结 binding 中的标准来源标记，移除任一边不会降级为旧来源。
已冻结标准 C 的紧急停止按其原始正式 C 与实际 TRAINING_SCALE 检查，不追随 Scale 后来装入的另一个 C；旧来源仍保留原守卫。
跨课程／用户、实际参与者、当前凭证、幂等和事务一致性继续由各入口的既有 ACL／事务和本轮窄适配共同负责。

## 实测成本与复用边界

先在真实 PostgreSQL 16.15 中用 64 条目合成正文测量，fixture 保持 APPROVED、试运行行数为 0，不能用于新引用。
首次 6 个独立事务 HISTORY 读取约 91.76 ms、24 次 SQL、完整组合／C 正文各读取 6 次。

随后在相同事务形状与正文做 fresh／reuse 对照：完整组合及 C 正文各从 6 次减少为 1 次；
余下 5 次仍逐次读取组合状态／C 状态头，SQL 总数仍各 14 次。fresh 约 61.08 ms，reuse 约 19.18 ms。
原始 V8 CPU profile、SQL 文本（不含参数）与计时分别留存。
这些是合成微型对照，首次 profile 含多个事务；对照期间其他定向单测在另一进程运行，不是独占容量或生产吞吐结论。

缓存仅用事务 client 的 WeakMap 保存已由数据库不可变触发器保护的正文／哈希事实，最多 128 组。
根 Prisma client 不复用，跨请求不复用；每次仍读取当前状态／指针／hash scheme，指针变化即重建。
账号、入口、grant、许可、时钟、停用判断与历史可读决策均不进入缓存。
真实 SQL 用例确认正文更新被数据库拒绝，同事务内状态变化及原 root 撤销仍即时拒绝。

## 检查、失败和运行位置

唯一主要执行位置为本独立云端。只启动本机 PostgreSQL／Redis，并创建专用 loopback
`eduk12_combination_flow_20261025_063054` 数据库；没有使用现有业务／开发数据，也未删除数据库或历史。
四份增量迁移与 Prisma generate 在该隔离数据库退出 0。

- 最新来源／冻结版本 55 例＋消费者串权边界 7 例，合计 62 例通过（内存 DB／SQL 边界替身，领域守卫真实）。
- 受影响既有 Training C／P／R 绑定、FINAL、报告选择及消费 80 例通过（内存合同）。
- 真实 PostgreSQL／HTTP 的 8 个不同局部用例按 4＋2＋2 的不相交选例完成；没有声称整份 8 例曾用同一次命令全部执行。
- 最终生产类型、相关测试类型检查退出 0；相关输入变更后才定向重跑。旧映射／golden 等未变输入沿用原记录，不以全套复验替代失败定位。
- 本轮最初 60 例执行有 44 例失败：SQL fixture 换行分派问题修正后定向 41 例通过、3 例失败；3 例实际内部严格指针解析问题修复后定向通过。原始失败保留；后续新版来源 55 例重新执行通过。
- SQL 最初两次 setup 均因隔离 AdminEntryGrant fixture 遗漏 id 在 beforeAll 失败，没有业务用例完成；修正 fixture 后才取得上述 4 个真实场景通过。
- 首轮生产类型有 3 个错误（ExactReferenceDb 参数合同及 copy JSON null），首轮相关测试类型有 1 个合成 JWT accountDomain 字面量错误，均保留原日志并修复；最终对应类型检查通过。
- 原 **11 项基线失败**保留原始 `preflight-validation.json`，未重跑、未修改其断言或据此声称基线成功。

完整原始报告／日志／CPU／SQL trace 摘要与直接输入哈希见
`docs/evidence/tool-onboarding-next-20261025/training-standard-flow-validation.json`。
这不是签名的完整依赖闭包或 CI 接纳证明；本轮没有启动 CI、push、merge、部署或用户 Mac 操作。

## 下一步的准确依赖与可继续项

完整正向 SQL／HTTP 场景需要父 dot 提供一个**已核验且非敏感的组合 fixture 的 Library 身份**：
原组合 UUID／hash／snapshot、正式 C 的完整内容和指针、真实已成功试运行证明；声明 P 时还需同一精确 native P 数据。
如使用 36 份自编工具，还需其可信版本化来源及对应 dot 代码提交，不能用客户端声明或合成外部许可证填补。
不需要真实答卷、生产凭据或父机器路径，也不要求转交实际入库任务。

本节点没有原生连接拒绝；这是待交付的可核验测试输入，状态为 **PENDING_INPUT**。
本节点不会制造 ONLINE 或三条试运行证明，也不会执行 dot 保留的安装／正式发布／试运行入库操作。
当前第一处实际拒绝接口是
`POST /api/questionnaire-products/standard-combinations/:combinationId/use-grants`：
`readCurrentStandardCombination` 对本节点 APPROVED／0 次试运行 fixture 正确返回
`409 STANDARD_COMBINATION_NOT_CURRENT`。这不是要求新增审批；需由父 dot 交付原已合格事实作为隔离测试输入。
装载后仍须真正执行发行／选择／发布／START／FINAL／P/R；这些后续路径没有运行，不声称来源门槛是唯一剩余问题。
收到 fixture 后，优先只跑上述最短纵向样例并修实际路径；通过后再扩展并发／矩阵。
可独立继续：受影响收集事务的精确 lease／停用／标记不一致合同、共用正文锁顺序、最短样例驱动及导入器，保持合成局部证据与实际纵向证据分离。

## 公库管理节点的精确协作接口

- `server-version/backend/src/modules/measurement-content/standard-combination.ts`：共同指针 `standardCombinationPointerSchema`；机械模板 `compileStandardCombinationReport`；原 hash 公式、正式 C producer、`versionMappings` 既有字段不改。
- `server-version/backend/src/modules/survey/standard-triplet.model.ts`：composeTriplet 复用同一模板函数；不修改工具文案／标签或公库 UI。
- 原 `GET /api/platform/survey-standard/candidate/:key/:version` 仍返回既有 `identity.releaseId`、`combinationHash`、各轴和 `measurement.pointer`；公库无需实现课程授权或制造 PUBLIC／隐式 grant。
- 消费方用上述组合 UUID＋hash，以及既有正式 C UUID 的 21B 分发 root。一次分给用户，课程归属只在 Training 实例上校验。
- `resources.standardCombinations` 是 Training 自有来源选择器，不是公库批量管理读模型；返回 useGrantId／useGrantVersion 只作提示，写入与使用实时复核。
- 当前共同 `describeStandardCombination().consumers.TRAINING` 仍保留第三块的 NOT_CONNECTED 常量，本块没有据局部证据将其改为“全流程就绪”；它与已写入的服务调用存在待收敛的描述缺口。完整正向样例验证后由父对话协调准确实现状态字段，ONLINE／接口已接线均不得冒充某用户已获准。
- 不要恢复已删除的 `standard-source.service.ts` 或原不可签发的课程 capability 预检；需要对接新来源时使用实际 add／preflight／publish 路径。

原第三块报告保留为历史证据。本次修订同步写入同一 Notion 检查点：
https://app.notion.com/p/404d27635a388114a958e99c51e2ead4 。

# 教育测评资源生产端交付

基线：`f46336cc45abaa21d4b946029cda2a0dfadec654`；独立分支：
`feat/pr363-education-source-publication`。没有修改集成分支、迁移、保护、凭据或生产数据；没有 CI、合并、部署。

## 已实现

- 真实的准备 → 冻结登记 DRAFT → 独立 REVIEWED → PUBLISHED → RETIRED 服务与已挂载路由。
  创建者不能自审；所有变更从服务器当前身份捕获 SYSTEM_ADMIN、PRODUCT_ADMIN 或
  PSYCHOLOGY_STAFF 的原始精确证明。创建、审核、发布均固定原 grant，后来取得其他角色不修复原撤权。
- 准备使用独立 `ORGANIZATION_RESOURCE` Composite，复用原 Scale/CognitiveAssignment/SJT 引用与 Form
  定义，不复制答卷、认知事件、参考样本或科研数据。不向要求非空 scale_id 的 legacy 注册表塞数据。
- 两阶段解决现有 DB 的 snapshot 首次非空后不可改写约束：准备候选保存在
  hash 绑定的 `AssessmentManagementEvent`；runtime 的 C/P/R snapshot 在登记选择 P/R 后只写一次。
  没有更改既有冻结 guard。准备、登记和状态提交的重复请求可核对原结果；更换内容拒绝覆盖。
- 复用现有强认证管理员内容授权入口，增加 SCHOOL/TEACHER + ORGANIZATION + 精确 UUID 的
  `material.distribute` 根授权，禁止转委托。组合、每个 C/P/R 和每个素材均须有实际目标产品/组织授权；
  产品管理员身份、源内容可读性、Training 课程授权均不能代替。管理员 UI 使用原请求编号、丢响应恢复、读取与撤销流程。
  旧审计 browser-entry 枚举仍不扩大；教育授权审计 entry=null，grant 中保存精确产品/组织。
- 原来源重新投影、比对真实已发布引擎定义、来源 snapshot、measurement hash、单元顺序、必答和 Form
  定义；SJT/Scale 保持 SELF 和目标产品受众。校验来源授权、已知原版权声明、当前源状态、素材的真实存储 hash/type。
  发布前持有实际源、release、素材和授权锁，使用数据库时钟再次检查原证明。
- 不带入原 Training P/R。只选择精确、已发布的适用教育产品/owner/runtime P/R 或适用平台内容；平台参考仍走原独立正式参考 resolver。
  使用现有 Reference Core 定义、measurement/scoring 版本与治理 hash 校验。报告必须匹配单元 C、受众、指标及实际
  `DECLARATIVE_REPORT_V1` generator。无已批准报告允许显式空，不能据此开放原始指标摘要。
  纯 Form BUNDLE 支持 null/null 或真实已冻结空 C/P/R 来源；必须有实际 Form 运行区段，只允许 NONE/COMPLETION_ONLY。

## 复用与新增边界

直接复用 `prepareTrainingContentSnapshot`、`trainingContentSnapshotSchema`、`buildTrainingFlowUnits`、
真实 Cognitive registry/参数投影、SJT author compiler/原发布核验、Scale 投影与授权 guard、
`getContentReleaseBatch`/canonical hash、Reference Core、正式参考 resolver、原 content grant 祖先锁与管理员 MFA/Origin/CSRF。
没有新增作答、计分、报告生成、数据存储或题本引擎。

新增的是教育入口/组织/原签发者/跨入口分发的适配以及不可变登记生命周期。
准备阶段不能调用只接受已发布教育元数据的 scope proof 来冒充作者授权；因此该阶段显式核对目标 scope 和原内容授权。
root 的 `282e9fb353d3216d33a58306db2dbf9ae3d3d04a` 已只读检查，未合入或重跑其检查；正式消费仍用 root 的共享选择器。

另修复一个实际共享问题：`typedCompositeFormQuestion` 的预览检查留下 enumerable
`displayIf: undefined`，使 `buildTrainingFlowUnits` 的 canonical hash 拒绝 typed Form。
现在只移除该预览 sentinel，保留已配置条件；直接共享消费者 25 项及含素材的真实 PG 来源路径已通过。

## 管理 API / UI 合同

School/Teacher 产品前缀分别为 `/api/campus`、`/api/huiteacher`，以下路径共用
`/organizations/:organizationId/assessment-resource-registrations`。身份来自对应产品既有 cookie；变更要求现有最近 MFA 和 CSRF。
系统管理员通过既有强认证、受信任 Origin 的 `/api/admin/permissions/education/{school|teacher}` 前缀使用相同路由。
这不让 Training cookie 认证教育产品入口。

| 方法/后缀 | 合同 |
|---|---|
| GET `/source-candidates` | 只投影本人实际获准的来源组合 ID/title/grantId/grantedResourceIds，不枚举私有 Training 库 |
| POST `/preparations` | `{resourceId,sourceCompositeId,title,family,licenses:[{resourceId,grantId}]}`；返回新的 runtime/item IDs、精确 C 指针、preparationHash |
| GET `/preparations/:id` | 同一作者的准备状态与可配置单元 |
| GET `/preparations/:id/content-choices` | 精确获准 P/R 的安全管理 DTO，空选择显式允许 |
| POST `/preparations/:id/register` | `{expectedPreparationHash,disclosure,references:{schemaVersion:1,units:[{itemId,choices:[{releaseId,entryKey,priority}]}]},reports:[{itemId,releaseId}],licenses}` |
| GET `/`、`/:id` | 分页注册元数据及其冻结详情；需要当前本校产品管理/心理老师身份 |
| POST `/:id/{review|publish|retire}` | `{expectedEntryHash,reason}`；审核必须不同于原创建者；返回当前 entryHash 和状态 |

前端 `components/education-tools/assessmentResourceClient.ts` 接收现有产品 transport，与私有工具 client 形式一致。
没有自行读 cookie/sessionId；根管理员的现有内容授权 UI 已能编制、恢复和撤销教育组织授权。
这里不新增工具编制页面，也不批准任何真实题本。

## root 集成要求（必需）

1. 合并合同中的 `origin.distribution={actorId,grants:[{resourceId,grantId,version}]}`。
   它是服务器捕获的精确原内容授权，不能在 NEW_USE 时重新发现替代 grant。
   与 root 的纯 Form 小改动合并时保留“只 BUNDLE 可空 units，实际 runtime flow 非空”及双方的披露约束。
2. 在 root 的新增使用/投放以及 `assertEducationAssessmentExecutionSource(...NEW_START)` 事务内调用
   `assertEducationAssessmentDistributionCurrent(tx,source.origin)`，并保留原 actor/组织授权锁顺序。
   `FROZEN` 恢复/历史 FINAL 不调用该新用授权检查；已有 FINAL 不因后来撤权重算或消失。
   核对 `source.origin.distribution.actorId === source.authority[0].actorId === source.runtime.createdBy`。
   本分支遵守委托，没有改 `authority.ts`、registeredResources、run.service 或 Teacher 宿主。
3. 锁序：SJT source advisory（排序）→ Organization UPDATE → User SHARE（不升级）/原组织证明 →
   delivery/Composite → 实际来源/精确 release/asset/content-grant。旧内容授权撤销只取 User SHARE → grant UPDATE，
   不持有 User UPDATE 等待本生产者的组织锁。新增使用端的完整原角色并发串行仍由 root 审查。
4. 正向 PG 来源覆盖普通已发布 Scale、真实 CognitiveAssignment、原始独立 SJT 作者发布、Form 及四类混合。
   Training standardCombination/privateVersion 专用来源 marker 的教育运行消费、静态 registry SJT 和公库特殊 lineage
   没有端到端验收；不要把本分支的普通四家族验证外推为这些专用 adapter 已通过。

## 实际验证与保留的失败

原件均为 `source-publication-evidence/*.gz`（无损 gzip），`manifest.json` 记录原始字节 SHA-256。
它的 sourceInputs 是收尾候选快照，不是为早先调用补造 contemporaneous manifest 或 CI 签名。
所有数据库写入只在新建 loopback `eduk12_pr363_publication_test`，PostgreSQL **16.15**；不是 dev 数据库或生产库。
当前全部既有迁移在这个新库实际 `prisma migrate deploy` exit0；没有新增迁移、dump/restore 或浏览器结果。

| 原调用 | 命令与真实结果 |
|---|---|
| backend types r1 | `tsc --noEmit` exit2：默认 UUID 参数类型、可选披露字段两诊断；修复后 r2 exit0 |
| backend types r3/r4/r5/r6/r7 | 同命令，因后续实际输入改变而定向重查；各 exit0。r7 为最终生产源码 |
| frontend types r1 | `tsc --noEmit -p tsconfig.app.json` exit2：扩大产品类型后原管理 UI state 仍限两个入口；已接入教育 UI |
| frontend types r2/r3 | 同命令 exit0；r3 包括新增教育 UI 恢复测试 |
| unit r1 | 两个改动的教育合同/reader 文件，17PASS，exit0；mock 合同，不算 PG |
| typed Form unit r1 | `typed-form-facts.test.ts`，25PASS，exit0；共享消费者回归 |
| frontend unit r1 | `AdminContentPermissions.test.tsx`，45PASS，exit0；含 School/Teacher 精确授权与丢响应恢复；mock UI，不算浏览器/授权数据库 |
| frontend lint r1 | 五个变化文件的 eslint，exit0 |
| PG r1 | 全新生产者文件12FAIL，exit1，首错为旧审计 entry CHECK；没有成功业务流程被重标 |
| PG r2 | 1PASS/11FAIL，exit1；固定 proof 多出 version 导致严格客户端 selection 拒绝 |
| PG r3 | 仅11失败项，11PASS/1filtered，exit0 |
| PG r4 | 新 picker/幂等/素材/撤权竞争与受影响 HTTP，2PASS/2FAIL/11filtered，exit1；typed Form undefined 与竞争观察失败 |
| PG r5 | 仅两失败项，1PASS/1FAIL/13filtered，exit1；竞争测试的 PG void 无法由 Prisma queryRaw 解码 |
| PG r6 | 仅竞争项，1PASS/14filtered，exit0；刷新真实统计快照并 executeRaw，观察 grant 等待后撤销，原 DRAFT 保留 |
| PG r7 | 4个受影响 SJT/混合项PASS，新增四类混合2FAIL，exit1；合成 Scale 用了空初始草稿，被原投影正确拒绝 |
| PG r8 | 仅四类混合，改用现有 compiler 编译的完整自有 Scale，2PASS/15filtered，exit0 |
| PG r9 | 仅 picker/幂等及缺测量授权反例增量，1PASS/16filtered，exit0 |
| PG r10 | 仅已冻结空 snapshot 的纯 Form 来源，1PASS/17filtered，exit0 |
| PG r11 | 仅受实际报告 generator 合同影响的报告项，1PASS/17filtered，exit0 |

PG 命令均为 `vitest run src/__tests__/education-tools/assessment-resource.publication.postgres.integration.test.ts`
加原始 reporter 中对应的 `-t` 筛选；使用显式同名 opt-in DB 变量及 NODE_ENV=test。
18 个唯一 PG case 都分别出现真实 PASS；各原调用有自己的输入和过滤身份，**没有声称最后一次整文件全跑或正式 CI 已通过**。
原 JSON report 的 fullName/状态/失败栈保留，可以按实际输入闭包独立审查后决定证据适用范围。

早期只读 `git status` 在 `/workspace` 非仓库返回128，随后定位实际 checkout；一条收尾 UI 文本脚本也曾因 cwd
错误未写文件，已在正确 repo 根修正。读取 root 新切片曾猜错文件名返回128，随即按真实 diff 定位。
均非权限拒绝、没有覆盖其他工作。未发生待批/被拒绝/不确定结果的外部写入。

尚未验证：完整 School/Teacher 新入、恢复、FINAL、报告读取及浏览器、专用来源 marker、公库素材字节运输、生产镜像、正式 CI、迁移升级旧库/恢复。
这些仍属于 root 集成与独立审查，不能由这里的生产者 PG 或 UI mock 代替。

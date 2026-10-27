# 教育 standardCombination / privateVersion 适配交付

工作分支 `feat/pr363-education-marker-adapters`，已正常合入 root
`42a36f3a12e8ebf34084b9df530069ef9a318658`。早先 rescue 两提交只是 WIP
保全；本说明和 `marker-validation-evidence/manifest.json` 才记录后续实际验证。

## 最小接口与复用

原 standardCombination / privateVersion marker 不改写、不重签。新 runtime
snapshot 的 `source.educationBinding` 独立保存：
`{schemaVersion:1,product,organizationId,resourceId,sourceCompositeId,sourceItemId,
runtimeCompositeId,runtimeItemId,ownerId}`。它被既有 runtime snapshot hash、
教育 origin 和 immutable entry hash 一起绑定，无需迁移或新增 origin 字段。
来源/目标/owner/Scale/C 指针必须全部相等；客户端不能凭该对象获得权限。

- `assessment-resource.service.ts:81` 仅允许同产品、同组织、本人 privateVersion。
  `:101` 创建目标映射，只复制原 marker；准备时不带入原 P/R。
- `assessment-resource.marker.ts:27` 通过已发布教育元数据核验精确映射，重读原
  Composite snapshot hash 与原单元；NEW_USE 另核目标 pinned distribution。
- `training-standard-combination.ts:103` 的教育分支回到原来源递归运行原 Training
  作者、课程、原 use grant/version、原 issuer/精确 grant、entry policy、版本和版权
  检查。原 Training 分支保留。没有扩大 ToolEntryProduct 到 SCHOOL/TEACHER。
- `training-standard-content.ts:13` 与 `training-standard-collection.ts:54` 保留
  新准入/已冻结历史的原有区分；历史身份读取不重新批准原权限。
- `training-content-binding.ts:121/:199/:265` 复用原 private version/Scale/C 定义
  核验；教育 START 和消费另核发布映射及产品/组织/本人。原 legacy private-scale
  runtime 仍走原 registered_assessment_resources 身份验证。
- 教育选择 PLATFORM 参数时复用原 `assertStandardCombinationDerivedRelease`，
  不能把任意 PLATFORM 参数当常模。报告仍须目标受众与精确 C/P/R；School 不接
  teacher 报告，缺适用报告显式为空。未新增编译、计分、作答、报告或样本存储引擎。

实际循环依赖首错为 `training-reference-binding.ts:18` 对未完成初始化的
`trainingContentSnapshotSchema.extend` 调用。binding schema 已抽到纯
`assessment-resource.marker-contract.ts`；reader/distribution/locks 仅使用时导入，
保留共享 `EducationAssessmentSourceError`，没有靠 mock 绕过加载失败。

## 锁与原授权边界

生产者 `assessment-resource.source.ts:59` 和教育标准来源消费
`training-standard-combination.ts:114` 在进入原 Training User SHARE 前调用
`prelockEducationStandardSourceActors`。它只发现源作者、marker owner/issuer、
原精确内容 grant 祖先 subjects，然后调用 root 的 User SHARE NOWAIT helper。
后续原授权查询全部保留；55P03 整事务回滚，无内部重试。没有改 root helper、
issuer/distribution/authority/repository/start/final/report。

定向追踪发现的阻塞 User SHARE 是 Training owner、standard recipient、
libraryActor、assertEntryAdmin 的 issuer 和 currentGrant 的祖先 subjects，均在该
marker prelock 覆盖内。private runtime identity/source 不取 User 锁；普通 library
use 只取 grant 状态锁，原作者普通 findUnique 是非阻塞读取。未据此宣称整个生产者
的账户冻结/批量资格撤销并发闭环；root 的锁竞争证据独立保留，未重复跑。

早先 admin-authority 扩展只接 `SCHOOL|TEACHER + ORGANIZATION + material.distribute`
的精确 UUID 授权：`admin-authority.service.ts:49/:60/:92/:125`。教育禁止转委托，
真实组织/资格另查；其他产品继续原 TRAINING COURSE / SURVEY PROJECT / 各平台
资源分支 (`:52/:56/:138/:143/:213`)。schema product 枚举扩展本身不授予其他能力，
旧 Survey 研究者/MFA 与 Training 作者/入口分配边界保留；本切片不再修改该服务。

## 真实验证与原失败

仅隔离 loopback `eduk12_pr363_publication_test`、PG16.15、Node24.21.0。
五个不相交 PG case 共通过：

1. privateVersion 真创建/编译/冻结/旧 wrapper → 教育准备/登记/独审/发布 → 共享
   START candidate；保留 exact version，拒绝伪造 sourceItem（private pg-r3，退出0）。
2. 标准 Scale 真安装/原发布/ONLINE 审批与三条真实 trials → 正式 Training 入口
   管理员分配原 use → School 新 runtime；START candidate/HISTORY、伪造映射拒绝
   （standard pg-r2，退出0）。系统管理员代替入口分配被真实拒绝。
3. 标准 collection 新准入成功；撤原 use 后拒绝；撤目标分发后拒绝；两次撤权后
   原冻结身份仍可读（incremental-r1 的 standard case，退出0）。
4. 另一位同校产品管理员接管 privateVersion 被拒绝（同增量 private case，退出0）。
5. 新来源明确重签 use 新版本，Teacher 显式选择获批 PLATFORM 参数/teacher 报告，
   独立登记/审核/发布、START candidate 和共享 P/R 消费通过（teacher-pr-pg-r1，退出0）。

命令均为 backend `vitest run` 对应两个 marker 文件；增量分别使用
`-t 'checks exact original|refuses to prepare'` 与 `-t 'selects exact approved PLATFORM'`。
增量恢复明确传入原 fixture UUID（日志 manifest/本测试注释），没有重跑前两正向 case。
未来完整文件调用可正常顺序生成自身 fixtures。

共享定向合同命令选择 training-content-binding、training-standard-source、
training-standard-combination-boundary 三文件，原调用退出1：95 passed、1 failed。
失败是 root 已新增 PLATFORM 教育身份查询，而旧 mock 禁止任何查询；仅更新该
unit fixture，缺教育发布身份仍拒绝，且恰好一次查询、零写入。
`-t 'PLATFORM report pointer'` 增量退出0、1 passed；没有声称原命令96项全绿。
最终 backend `tsc --noEmit` r7 退出0；`git diff --check` 退出0。

原循环加载 PG 0断言失败、standard 首轮错误夹具的系统管理员403、旧边界 mock
失败、原 types 失败/空日志均保留。救援 manifest 和 raw diff 原件不改写。
本证据不是浏览器/真实受试者 START、子作答、耐久 FINAL、报告 outbox/replay 或
PG17 新锁竞争证明；这些仍由 root 集成闭环。没有 CI、PR 合并、部署或真实工具批准。

# 第三块阶段检查点：Training 精确来源与冻结引用

本块代码提交 `be67440f52dba90576e3640a8d3987ae5b7d7c19`，产品 tree
`fa6f5fd568fe309b9fe9913343f5a471ca2d3c8b`，起点为第二块
`e9e66fd6b41e55f398006fd1f2d9f64d8371b668`。按父对话要求先交付阶段检查点，
尚未完成整条 Training 消费链。未改变原 #355＋#356 基线，没有接入其他节点的私有提交。

已同步并回读核对的 Notion 检查点：
https://app.notion.com/p/404d27635a388114a958e99c51e2ead4 。

## 哪些已经接线，哪些仍是内部合同

- `server-version/backend/src/modules/measurement-content/standard-combination-source.ts`：
  新增 `readCurrentStandardCombination`。在调用方事务里按同一组合 ID＋hash 读取并锁定既有批准行，
  复用 `describeStandardCombination` 和正式 C 仓储；核对三轴及 definition/references 对应关系。
  不读取 latest，不新建 Training 版本表，也不把 ONLINE 当作入口或用户授权。
- `server-version/backend/src/modules/composite/training-standard-combination.ts`：
  新增严格来源输入、`freezeTrainingStandardReference` / `verifyTrainingStandardReference`。
  在现有 owned COURSE 问卷、真实 Training 课程和 STANDARD Scale 上准备轻量引用；
  来源必须对应同一已安装工具版本和正式 C。新引用保留当前 Scale 使用权、部署与真实第三方许可，
  同时核验课程级精确组合能力及其 issuer 当前 TRAINING 入口管理资格。
- 同文件的 `freezeTrainingStandardBinding` / `verifyTrainingStandardBinding` 是**内部冻结合同**，
  绑定 composite/item/course/owner/scale、组合及三轴、正式 C、grant 版本、attempt/epoch/publicationHash。
  已验证序列化往返和容器串用拒绝；没有写入 item、原有 trainingContentSnapshot 或 Assessment。
  context 必须由后续已授权父流程提供，hash 只表示完整性，不能充当使用凭证。
- `server-version/backend/src/modules/questionnaire-product/standard-source.service.ts`：
  `previewTrainingStandardSource` 在一个 READ COMMITTED 事务内调用真实领域守卫；
  始终返回 `persisted:false`、`publicationReady:false`，不保存草稿、不签发 grant、不发布或开放采集。
- 唯一新改的已有文件是 `server-version/backend/src/modules/questionnaire-product/routes.ts`，仅增加 import 和
  `POST /api/questionnaire-products/:id/standard-combination-source` 路由，位于原 authenticate/requireTeacher 之后。
  它是来源预检接线，不是发布或作答接线；没有执行真实 HTTP 验收。

## 当前 API 和不可变身份

预检请求体严格限定为：

```json
{
  "itemId": "<existing Scale item UUID>",
  "courseId": "<owned Training course UUID>",
  "combination": {"releaseId": "<approved combination UUID>", "combinationHash": "<64 hex>"},
  "useGrantId": "<existing exact course capability grant UUID>"
}
```

服务端用户来自当前认证上下文，不接受 body.ownerId、self_authored、visibility、客户端三轴或自填内容。
结果的 `reference.combination.axes.CONTENT/PARAMETERS/REPORT` 均保留 `version/axisHash/sourceVersion`；
`reference.measurement` 是真实正式 C 的 `releaseId/contentHash/measurementHash`；
`reference.authority` 保留 `useGrantId/useGrantVersion/issuerId`。
没有把轴 hash 冒充正式 P/R release hash，也不复制 definition、参数正文、模板或答案。
`reportDisclosure: EXISTING_TRAINING_POLICY` 仅声明保留原报告政策，不能授予新的受众权限。

当前内部精确能力合同为：

```text
product=TRAINING
scopeKind=COURSE, scopeId=<course UUID>
resourceKind=material
resourceKeys=[standard-combination:<combination UUID>:<combinationHash>]
capability=material.use
```

它复用现有能力链和当前 issuer 检查，不建立第二张万能授权表。
**该合同的正式签发适配尚未实现**，不得要求公库节点伪造或隐式补发授权使预检通过。

## 21B 的确切缺口

现有 `server-version/backend/src/modules/measurement-content/admin-authority.service.ts` 的
`wireGrant`/`supported` 只接受既定能力范围，并要求 resourceKeys 为 UUID。
当前 TRAINING/COURSE 支持 report、reference、data，不接受 material.use；
这里的精确组合 key 也不满足 UUID 规则。新增两个真实 schema 合同分别确认：
精确组合 key 被拒绝；仅换成组合 UUID 仍不能绕过 material.use 范围限制。

因此，来源和冻结测试中构造的授权行只是既存记录替身，**不是当前 21B 已成功签发的证据**。
本块从未调用签发服务或写入能力表。下一块需沿当前强认证签发、入口管理资格、对象范围与审计规则
补一个窄组合适配，和现有用户使用权衔接；这不意味着新增逐工具人工审批，也不取消原 Scale 使用权。
`admin-authority.service.ts` 本块只读未修改，后续由本节点维护，接口变更先交父对话协调。

## 新引用、在途采集和历史读取分别处理

- 新引用：要求 ONLINE、正式 C PUBLISHED、当前新启动 hold 通过、已安装 C 对应、真实当前部署/许可通过。
- 在途引用校验：仍逐次核验同一组合、grant 原版本、当前课程/作者/issuer 权限及紧急停用。
  WITHDRAWN、撤销精确用户 grant、当前入口资格失效都不能由已匹配的 hash 绕过。
- 在途校验不把 start-only 手工 hold、过期的新启动许可或后来 Scale 草稿状态自动解释成中断旧作答；
  沿既有原生在途边界允许正式 C SUPERSEDED/RETIRED，拒绝 REVOKED。
  原始父运行时的窗口、deadline、学生访问与会话检查还未接入本合同，后续必须保留。
- source 身份锁先于用户/grant/release；等待停止锁后再次读取数据库时钟、能力链及入口资格。
  新引用还重验许可到期，防止等待期间过期后继续通过。
- 没有把本合同接入历史报告读取，也没有更改撤回后历史可读性或 participant 报告开放规则。

## 与公库管理节点的准确接口和文件交集

公库任务 `01a17181-e464-749a-a717-a10d2e304037` 可继续自己的 UI、分类和批量读模型。
本块没有改公库 UI、标签、source JSON、`scale-library-read-model.ts` 或 `unified-catalog-model.ts`。

1. 第二块的两个已有交集文件完整路径为
   `server-version/backend/src/modules/survey/standard-triplet.model.ts` 和
   `server-version/backend/src/modules/survey/standard-triplet.service.ts`；本块均无新增修改。
   前者的 `composeTriplet`/`tripletSnapshot` 复用共同 hash；后者的 `standardTripletDetail` 返回 `versionMappings`。
2. 公库应复用现有
   `GET /api/platform/survey-standard/candidate/:key/:version` 的 `versionMappings`，
   选择时交付真实组合 `identity.releaseId/combinationHash/toolKey`；同时保留三轴
   `axisHash/version/sourceVersion`、明确空轴事实和 `measurement.pointer/status`。
   不按标题、分类、instrumentVersion 或最高版本推定同一组合。
3. 本块新预检接口只接上述组合身份、已有 item/course 和实际 useGrantId。
   公库无需实现 Training 的课程授权、冻结、运行时和报告消费者，不应通过 PUBLIC 或自动补 grant 满足该接口。
4. `measurement-content/standard-combination.ts` 的 `consumers.TRAINING.sourceAdapter` 仍为 NOT_CONNECTED，
   entryAdmission/targetUseGrant/runtimeAuthorization 仍为 NOT_EVALUATED。
   内部合同完成不等于真实持久化和投放完成，公库不得把 ONLINE 自动显示为 Training 已就绪。
5. 需要复用 dot 来源许可实现时，由父对话提供同一 Library 身份、完整提交和验证输入；
   本块合成合同不依赖 36 份文案/标签，也没有重新实现它们。

## 验证与失败保留

本轮主要执行位置为本云端后端。修改范围是来源预检与内部冻结；
定向检查用于发现错组合、串课程/用户、撤权、等待后过期、非法来源和错误容器绑定。
沿用第二块未变输入的映射/旧消费者证据，没有重跑整套 CI 或原有基线失败。

- 53 个来源/冻结合同用例：第二次 51 通过、2 失败；修复停止查询夹具的分支匹配后，只重跑这 2 个，均通过。
  首次 18 个失败来自 tagged-template 数组 `.values` 被误当参数，修复夹具后加强拒绝用例的具体错误断言，
  重跑该受影响文件的 53 例；未将首次夹具错误造成的拒绝算作可靠权限证据。
- 4 个预检服务合同通过，2 个当前 21B 不支持的边界合同通过，共 59 个不同用例取得相应通过结果。
- 当前生产后端类型、新来源测试类型、新服务/21B 测试类型检查退出 0，`git diff --check` 通过。
- 所有测试只用内存数据库/SQL 边界替身，调用真实授权、入口、许可、版本和紧急停止校验器。
  未 mock 这些领域守卫，但这仍不证明真实 PostgreSQL 锁竞争、迁移、完整 HTTP 或学生闭环已通过。
- 11 项既有失败保持原证据，未修复、未重跑，不能声称当前基线或全仓库全绿。

原始失败、执行次数、分项结果、日志和直接输入摘要见
`docs/evidence/tool-onboarding-next-20261025/training-standard-source-validation.json`。

## 检查点之后的最小下一块

先由父对话按本清单协调文件和接口，再继续本节点的 21B 窄签发适配、槽位/冻结最小持久化及当前消费接线。
随后处理标准 P/R 的可信跨入口引用、原报告受众和 FINAL 事务/幂等守卫。
现有 STANDARD 的 `frozenDatabaseScaleDefinition` 默认仍使用注册包；新组合消费必须显式传入核对后的来源，
不能仅改 Scale.definition 期待运行时跟随。上述生产运行路径本块均未改动。
实际安装、正式发布、36 份转正和合成试运行继续留在父对话 dot。

本检查点没有 push、CI、merge、部署、生产写入、实际入库、数据库清理或用户 Mac 操作。

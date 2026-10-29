# 实施记录与公共边界

基线：`2de32609e1888cf28b73cb26e2c0cf38b11ff875`。本文件随实现更新；
[规范](specification.md)及[素材 manifest](source-manifest.json)保留来源和当前缺件。

后续实现与实跑结果分段记录：[Training 管理与匿名全过程](training-progress.md)、
[教育精确组合批准范围](education-admission-progress.md)、[三份基本素材装载](scale-materials-readback.md)。
[Training T1→T2/T3 接线](training-binding-progress.md)给出共同契约的轻量指针及 legacy 兼容。
[教育 T1 与原委托校验](education-use-progress.md)和[教育原授权指针](education-selected-source-progress.md)及[教育固定配置目录](education-selected-catalog-progress.md)记录后续实现。
[教育管理员内部服务](education-manager-services-progress.md)与[管理员 HTTP/页面](education-manager-ui-progress.md)记录管理读取、接收者、自身 use 撤销和跨报告目录歧义修正。
[教育显式授权替换](education-replacement-progress.md)给出同一工具的新授权 lineage、普通撤销旧 use 和完整请求恢复；旧草稿不自动换 binding。
[教育 T2 草稿变化审计](education-draft-change-progress.md)保留明确新增/移除 slot 的原授权身份、修订和内容 hash，不制造 legacy 的历史绑定。
[Survey 原入口修订绑定](survey-standard-use-progress.md)与[Survey 页面/HTTP](survey-standard-ui-progress.md)记录精确 grant、草稿/波次冻结、新 START 原授权校验及账号/请求恢复；被试全链路仍待执行。
[Training 具名配置与原请求恢复](training-named-configuration-progress.md)记录管理员业务命名、完整原意图回读、使用者精确选择身份及固定 P/R 展示。
[旧授权来源证据盘点](exact-authorization-inventory-progress.md)在数据库强制只读下核对既有 T1/来源和 legacy，不作历史回填。
[管理员共用 C/P/R 查找](approved-scale-axes-progress.md)支持在当前入口已有的已批准组合中逐轴筛选，再明确选择精确来源；不代审批新搭配。
以下共同契约和撤权矩阵是初始基线记录；当前新增源码仍在独立开发分支，未合入 main。

## 当前共同契约

`modules/assessment-authorization/selected-configuration.ts` 是纯身份合同，
已由上方分阶段接线消费；它本身不授予权限，也不声称四入口已完成。

输入与输出供任务 2 或各入口适配层审阅：

```ts
sealSelectedConfigurationBinding({
  product: 'TRAINING' | 'SURVEY' | 'SCHOOL' | 'TEACHER',
  configuration: StandardCombinationIdentity | CognitiveProfileIdentity,
  authorization: {
    kind, id, revision, issuerId, recipientId, organizationId,
    authority: [{kind: 'ENTRY_ADMIN' | 'CONTENT_DELEGATION', id, revision}],
  },
}) // => {binding: {schemaVersion: 1, product, configuration,
   //              configurationHash, authorization}, bindingHash}
```

量表身份引用已有 combinationId/combinationHash、measurement release 指针与 C/P/R
轴版本/hash；认知身份引用已有 config/version、measurement、精确 profile、
profile/metric/quality/report/presentation 版本、resolvedConfigHash、protocolSignature、reportHash。
不携带每次作答 seed 或复制完整报告体。源对象保存在原有 release/snapshot 中。
`readSelectedConfigurationBinding` 保留历史读取，不查询当前权限；只有 null/undefined
表示没有新 binding。提供的损坏/未知对象拒绝，不能降级成 legacy。

调用者须先在既有事务中核批准范围、真实 issuer/recipient、精确委托与一次机械兼容，
再封存。解析/hash 不是授权证明；NEW START/发布仍核当前权限。
组织范围不从请求中的产品声明推导。selfGrant 身份可表达，双资格仍由原服务检查。

T1 接既有 grant 修订，T2 在原草稿 source/snapshot 字段保存轻量绑定；T3 沿用原
admission。此初始实现不新增表、迁移、API、Bundle 字段或引擎分支。
任务 2 可继续消费其原冻结 C/P/R；若需新增字段，由 DOT 协调，避免同时修改引擎。

## 基线普通撤权矩阵（源码核查，尚未替代实际用户链路验收）

“新 START”包括已发布但尚未入场；“续答”仅指已有当前 epoch 的合法 attempt，
不是为另一个用户/epoch 复用入场。

| 路径 | 新建/旧草稿发布 | 新 START | 已入场续答 | 历史报告 |
| --- | --- | --- | --- | --- |
| Training STANDARD_COMBINATION | 原精确 useGrant+version 必须有效 | 检查原精确使用权与当前入口/来源 | 使用 frozen completion 合同；不借新 grant 替换旧身份 | 数据 ACL 后读冻结定义/结果 |
| Survey 精确来源 | 原 catalog grant 必须有效；不换新来源 | sourceGrantId ACTIVE；旧发布仅回查原 sourced-draft FK | `newAttempt=false` 保留旧绑定，不调用新入场 policy | 数据 ACL 后读 publication/FINAL frozen 数据 |
| School STANDARD 公共来源 | 当前作者/学校/product、material.use 精确键 | 原 public-source use、来源、学校权限 | BOUND_COLLECTION 不重新要求作者/源 use；保留紧急停止 | 当前数据/受众权限；原冻结来源 |
| Teacher STANDARD 公共来源 | 同上；不泛化 productAdmin、心理教师与个人许可 | 同上，按 Teacher 实际产品 | 同上；保留真实任务和受众关系 | 同上，个人量表许可单独保留 |
| 教育 custom-library | 独立 member/use 链，不能用 STANDARD 作者资格取代 | 当前精确 library grant/issuer | 既有 frozen collection 合同 | 原数据权限，不能用当前 use grant 重算报告 |

证据入口：Training 的 `standard-combination-use.ts`、`training-standard-combination.ts`、
`training-standard-collection.ts` 和 `scale-collection-guard.ts`；Survey 的
`catalog.service.ts`、`tool-policy.ts`、`scale-collection-guard.ts`、
`content-binding.service.ts`；教育的 `public-source.catalog.ts`、
`educationCompositionExecution.ts`、`library-source.use.ts` 和 `education-use.ts`。
普通撤权和紧急停止分别测试；不由这张表扩张原有停止/恢复政策。

## 初始迁移/缺件记录（后续以 manifest 和上述检查点更新）

当前工程变更没有迁移或历史回填。loaded 数据库只有 11 个候选配置、一个合成
不可登录安装 actor、11 条安装审计；没有真实用户、任务、material grants。
不能用这一空业务库推断生产 legacy 数量。迁移 dry-run 将对专用合成新/旧 fixture
按实际 schema/version/null 分类；不查询生产。

量表三份六 R 未取得远端 SHA。连续图像再认缺正式图片池、seed、native runner。
PR #368 的 11 个配置只在独立库装载，main 没有其运行时代码；未纳入可执行选择。
不复制未提交内容、不代执行特定被拒工程提交。

## 检查和 CI 边界

当前变化：新增纯身份模块及直接测试、规范/manifest；没有现有业务消费者变化。
主要检查位置为本云节点：损坏绑定、跨产品/学校/接收者、双 R、修订、历史缺失、
profile 定义漂移及独立 seed 边界；当前 14 条通过，直接 TypeScript 闭包检查退出 0。
这些是本地结果，不是正式 Actions/合并资格。

PR1 的用户旅程、权限 fixture、实际环境迁移、同环境性能基线及适用 CI 尚未完成。
后续 PR2/PR3 各自完成对应场景，不把现有 14 条替代四入口链路。
CI 前已读取 Notion CI 常见错误清单；按实际候选选择 CI-001/003/006/008/009/013/
018/019/020 等适用项，不运行全平台。没有启动 CI、Ready、merge、部署、APPROVE、
强推或修改保护；source/fixture/环境变化时仅重验受影响项。

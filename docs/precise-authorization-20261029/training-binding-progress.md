# Training 的 T1 修订接入现有 T2/T3

本增量在已有 MaterialGrant、standard release 和 assessment management event 上接线；不新增授权表、权限中心、运行时或 Bundle 引擎。仅增加一个已有审计表的精确修订索引。

## 公共输入输出

T1 通过原有精确发行流程，核当前入口/委托、接收者、组合与机械可执行事实后，将共同契约 `SelectedConfigurationBinding` 写入 `STANDARD_COMBINATION_USE_GRANTED` 的现有审计 metadata。组合继续指向已有不可变 C/P/R 和 measurement release。新的 requestIntentHash 同时覆盖发行者、接收者、组合、委托及 optional expected versions；同一 requestId 改变这些字段不能得到原成功回执。

T2 的已有 `standardCombinationSource.reference` 增加可选字段：

```ts
selectedBinding?: {
  bindingHash: string
  configurationHash: string
  authorizationId: string
  authorizationRevision: number
}
```

它是服务端从原授权修订读取的轻量指针，不是使用者可提交的 C/P/R 选择。现有 reference 已有精确轴和原 authority，不重复保存题本、报告大对象或 attempt seed。发布时仍沿原 referenceHash 校验；T3 继续冻结已有 source 和 attempt 级内容。历史解析能从 reference 中的原 C/P/R/authority 重建共同契约指针并核对四个字段，不访问当前 grant 或最新 registry。

任务 2 可继续使用原冻结 source/内容协议。新增可选字段随原 JSON 携带，无需改 Bundle 评分或报告引擎；缺失新字段表示 legacy，不代表最新默认配置。

## 旧授权保护

不存在可信 T1 metadata 的旧授权继续明确返回 legacy。损坏、跨接收者/修订/发行者、冲突或来源不匹配的已提供 metadata 拒绝，不能回落 legacy。现存 active legacy 修订的重试不会补写新 T1 身份；明确撤销/重新分配才得到新修订。原有历史来源即使没有新字段，也继续按原数据权限读报告。

T1 查询限定原组合 + grantId + useVersion，重复的相同审计值可以复用，冲突值拒绝。查询不是 latest；当前权限仍由原服务在事务中验证，不能把审计 hash 当作授权。

## 已执行与未执行

- 受影响的 86 个单测通过，含 legacy 路径、T1 读取、跨身份/修订/来源、冲突证据和冻结指针被改后重算外层 hash 的负例。后端依赖闭包类型检查通过。
- 独立 PostgreSQL/HTTP 的两个场景通过：真实 T1 审计及完整意图幂等，随后草稿→发布→匿名 START→表单/量表 FINAL；普通撤权后阻止新 START，已入场完成与旧 legacy 报告读取保留。
- 最初 JSON reporter 执行在 suite hook 阶段失败，未执行两个场景，报告未包含 hook 原因。已只读核对数据库仍为四用户、一条旧使用权、一个旧完成记录且 HTTP 事件为空，再作同输入 verbose 诊断；两个场景均实际通过。没有将最初 2 个 pending 当成通过，也没有猜测错误原因。
- 两个 HTTP 场景之后增加了纯冻结指针自校验；没有重跑授权/START/FINAL。最新 86 项测试覆盖该新增检查，另用已保存真实数据只读验证了 2 个 typed 和 3 个 legacy source 均可解析。这个新检查的验收范围与前面的 HTTP 证据分别记录，不能冒充完整链路在同一最终输入重新跑过。

尚未执行正式 GitHub CI、浏览器全过程、同环境性能对照。接收者业务命名/管理员默认、手动合法 C/P/R 搭配、Survey/School/Teacher 完整绑定仍是后续工作；这不是 PR2 或四入口完成声明。未修改生产、真实用户或被拒的 sidecar seed/注册工程。

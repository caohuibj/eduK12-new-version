# MOT 报告显示补丁：1.1.0 → 1.1.1

本地开发完成，尚未提交、合并或部署。只为四项「平均找回目标数」设置至多一位小数：`2.6666666666666665 → 2.7`，整数仍显示 `3`。原始 metric 数字、单位、分母、聚合、方向、质量门槛、协议、输入、试次数和素材均不变。没有新常模或能力等级。

|冻结组合|读取/新 START|显示|编译与迁移|
|---|---|---|---|
|MOT engine 1.1.1 / scorer 1.1.0 / config 1.0.0，report 1.1.0|保留；旧 assignment 新开施测也选旧 bundle|保留原格式，包括历史长小数|以旧描述编译；不覆盖现存 runtime/result/report|
|同测量 tuple，report 1.1.1|新授权发布冻结默认选此版|四个均值至多一位小数|sourceDefinitionHash/compiledRuntimeHash 随显示描述改变|
|未知 report 版本、旧/新 descriptor 混用、错误测量 tuple|拒绝|不回退最新版|不得静默重算或迁移|
|其余三个 native 任务|仅其当前 report bundle|无本次改动|未扩大准入|

`report-bundle-1.1.0.json` 在修改前从实际旧 definition 的 report/metrics/quality 导出；SHA256 为 `29b432bc9aa0f9cddf0406a8d6950831c35e58c8c5257e770b4373b6f6b6649e`。按版本显式 allowlist 并返回副本；冻结读取仍校验 exact identity、protocolSignature、profile/metric/quality 版本及完整 descriptor hash。未移除 gate。

实际入口：`freezeNativeAssignmentProfile` 默认冻结新 report；`readFrozenReport/assertNativeFrozenReport` 读取已允许的对应历史 bundle；`prepareUnifiedCognitiveSessionConfigSnapshot` 根据 assignment 冻结 report 选 definition，create/restart 两处均传入该 snapshot；`buildRunnerPayload` 接受已核的允许 bundle。现存 runtime/result 不写入、不重编译；既有 FINAL 消费冻结 report/metric descriptors，读取 stored report 不重新格式化。

measurement 发布投影排除 report 版本和 metric precision，本次 measurementHash/contentHash、configHash、protocolSignature 不变，既有 measurement release 不需因本显示修复重发布。旧 assignment 仍保持旧冻结报告；需要新显示的任务应走原有授权发布/冻结流程。compiler 完整 source descriptor 包含 report/metrics，故新编译 hash 有意变化，不冒称与旧 runtime 同一产物。

## 本次检查与复用边界

- 云端新单文件 `mot-report-format.test.ts`：4/4 首次通过，实际退出 0；覆盖四均值唯一显示差异、raw/null/invalid gate、旧 JSON 字节 pin、旧/新冻结读取拒混用、真实 START preparation 选冻结 bundle、编译 hash 分离、measurement 发布 hash 不变、既存旧 formatted report 解析字节保留。数据为明确合成对象，不调用 scorer；无数据库访问的 trap 保证本轮 preparation 不访问 DB。没有宣称新增完整 PG/browser 旅程验收。
- 实际 backend tsconfig 的七根导入闭包：第三次退出 0。前两次失败（新测试类型断言、导出返回类型可命名性）及日志均保留；修复仅增加类型。保留首次测试源码与冻结校验修复前源码，TypeScript 去类型输出逐字节相同，故不重复已合格行为检查。见 `type-only-equivalence.json`。
- 未执行：旧 scorer/seed/capture、2+9 浏览器/时序、完整构建、CI、生产、COS、部署。没有改锁、schema 或迁移。开发自查不等于独立审计。

精确源码与原件 SHA 见 `status.json`。类型实际执行配置、命令、退出和耗时见 `types-run*-receipt.json`；行为原件为 `tests-run1.json` / `.log` / `-receipt.json`。前端和 COS 由其他 owner 处理，本补丁不修改其源文件。

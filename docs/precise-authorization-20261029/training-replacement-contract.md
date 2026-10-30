# Training 替换可选契约（实现及验收见进展）

基线：`9b8731e8a89450f0fa04c83d5005ac7bfcbe5e73`。复用原标准组合发行服务、MaterialGrant 和 immutable assessment management event，不改 Bundle/认知引擎。

```ts
// 原 target combinationId、combinationHash、接收者、名称和入口/委托仍完整校验。
expectedUseId?: string; expectedUseVersion?: number; // 已撤销的新目标组合 use
replaces?: { grantId: string; expectedVersion: number; reason: string }; // 原旧组合 use
// 新 T1 与原请求回读：
supersedes?: { selectedBinding: originalPointer; reason: string };
```

两个修订不可混同。仅本人给同一培训师、同一工具的可信原精确 use 可被替换；新目标若已有活动 use，不原位覆盖。相同组合改名沿用现有明确撤销/再发行流程。legacy 无原 T1 不自动升级。新来源和当前发行/接收/入口权限照常验证，旧来源只作 HISTORY 身份核对，不能以新默认 R 回填旧快照。

计划在同一原事务发行新目标修订，保留旧 T1，普通撤销旧 use 并记录前后指针/原因。幂等 hash 包含完整 replaces。按请求及接收者/工具锁定，避免竞争替换各自发行新结果。草稿仍指旧 binding，已发布和已入场合同保留；新 START 按原撤权矩阵，不改 attempt seed。

本文件说明可选输入/输出及边界；实际数据库、HTTP、页面结果见 [Training 替换进展](training-replacement-progress.md)，性能与后续完整链路仍以未执行边界为准。

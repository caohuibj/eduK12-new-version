# 登记前端精确多 grant 接线

基于管理分支 `26c16c278320d9a4074b7d3a0e88ad7c0a356508`，只读核对 source 工种的 `b045751a29c080e6e52f67252fed7c875f007f7c`、`source-license-selection-progress.md` 及实际 service 返回值。本片不修改或合并其后端实现，不重跑已过的四个真实 PG 用例；root 最终需将两个切片集成。

## 核心修复

- client 类型与真实 DTO 对齐：source 的 canPrepare/unavailableReason/licenses；preparation 首次、重放、恢复的原固定 licenses；P/R 的 selectable/unavailableReason/完整 licenses。旧 grantId/grantedResourceIds 字段已移除。
- 去掉人工勾 UUID 与单 source grant 分配。prepare 原样复制所选 source 的精确 `{resourceId,grantId}` selection，不加入宽授权的其他 UUID。来源标题和许可状态正常显示，精确 ID 放折叠详情。
- register 以 preparation 原 licenses 为基底，仅添加明确选择的 P/R 完整 licenses（包含所有素材依赖）。共享资源按 resourceId 去重；相同资源不同 grant 在发请求前明确拒绝，绝不覆盖原证明。未选 P/R 不夹带任何许可。
- 恢复只读原 registration 或 preparation + content-choices，不请求 source-candidates、不查找当前 grant。原准备标题/家族回填，许可证保留原 DTO。已有准备期间禁用来源刷新；未准备时刷新会清空旧来源/P/R 选择。组织/身份/transport 的既有隔离保持。
- 不可准备的 source 和不可选择的 P/R 禁用并说明原因。无可选 entry 的参考只显示不可用说明，不伪造 checkbox。P/R 消失/不可选和 grant 冲突都在调用前拒绝；本地拒绝不再被错误标为“写入结果不明”。真正发出 mutation 后的丢响应仍必须原编号回读，不重复提交。

原可读冻结摘要、NONE/COMPLETION_ONLY/INDIVIDUAL_SUMMARY、纯 Form 无摘要、只读派生 policyKey、Training 日期控件和本地时区→UTC 协议保持。不增加授权接口、审批 bool、题本、编辑/计分/版本存储引擎。

## 定向验证

`registration-exact-license-evidence` 保存原 reporter、日志、退出码、源码观察（非追签/正式 CI 证据）。环境 Node24.21.0 / Vitest4.1.11，TZ=Asia/Shanghai。

首轮只选七个受影响场景：6 PASS / 1 FAIL / 6 filtered。失败是报告定位器同时匹配“已批准报告的本人摘要”；实际 R option 已禁用。仅将定位范围收窄到精确报告 select 后，该项补验 1 PASS / 12 filtered。原失败及已过六项保持原身份，没有重跑整文件。

这七项覆盖多 grant/素材去重的真实 client payload、原 preparation 恢复且禁止 sources 请求、冲突前拒绝 POST、不可用项、NONE 及未选内容不带许可、来源刷新清选和显式反馈/纯 Form 直接消费者。测试为合成 API/DOM 合同，不声称实际数据库授权或真实浏览器成功。

前端 app types、三文件 lint 及修正测试单文件 lint 的实际结果记于 manifest；没有构建、CI、部署或真实工具批准。原 source PG 和无关面板已成功用例未重复。

## 集成状态

此前 `registration-summary-progress.md` 中 exact DTO 的 pending 已由本片解决；原人工方案已被替换。后端 DTO/prepare/register 资格以 source 的 b045 切片及 root 合并结果为准，本片只做前端消费，不把合成合同当实际 PG/浏览器资格。无被拒绝、待审批或结果不确定的外部写入。

# 登记面板独立展示修正与待接接口

基于管理端 `b6e30a68ec840c8dccf43a63e7a33049120ff65d`。本片只修共享面板及直接测试，不改 source producer。

冻结结果改为默认可读的标题、工具家族、精确版本、状态、创建者/审核者账号、本人披露、开放方式/UTC 时间与各 C/P/R 固定指针；原 JSON 收入默认关闭的技术详情。历史未配置反馈时不补默认值，仍显示原历史政策未配置。若服务端没有人员姓名，只显示实际返回的账号，不编造人名。

新增 NONE（不展示反馈）选择，纯 Form 仍不提供摘要选项。披露 policyKey 是该登记 UUID 稳定派生的只读 opaque 标识，不再要求操作者发明权限标识；disclosure 的合法性、计分/报告资格仍由真实服务校验。没有新审批布尔值或编辑引擎。

验证为新增可读摘要/历史 NONE 用例 1 PASS、其他 8 filtered；前端 app types exit0；两文件 lint exit0（0 errors、1 ref cleanup warning）。最初在仓库根启动 Vitest 返回 MODULE_NOT_FOUND，未执行测试；修正 cwd 后仅执行该新用例成功。原失败日志、reporter、退出码及源码观察在 `registration-summary-evidence`，没有重标原件，也没有重跑整套成功用例。没有 PG、浏览器、构建、CI、发布结果。

尚未完成、等待 source 工种具体 DTO：

- source-candidates 提供逐资源的 exact licenses，不是单 source.grantId 套所有 resource IDs。
- preparation/read 返回原准备固定 licenses，恢复不再查询/发现当前目录 grant。
- P/R 的候选携带各自所需素材依赖的授权选择，登记合并必须保留固定 grant 并拒绝冲突，不能猜集合。

上一片人工勾 UUID/单 grant 映射的方案不能处理独立 grant，**不能视为正确可用流程**。此片不把旧行为的新 mock 当作修复证据。新合同尚未收到，接线状态为 pending；没有接口写入被拒绝或结果不确定的外部操作。收到 source 的精确合同后，在同一分支继续替换旧映射，并只补受影响载荷与恢复测试。

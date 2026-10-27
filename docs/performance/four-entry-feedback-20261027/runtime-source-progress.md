# 共享运行消费者增量

基线 f46336cc45abaa21d4b946029cda2a0dfadec654。此切片复用 Training 的现有 transactional Composite、Cognitive child、C/P/R release/selector、reference binding、Form definition hash，不新建计分、参数或报告引擎。不批准或发布真实工具。

## 实现

- COGNITIVE 家族注册到现有事务型 Composite adapter；未知/草稿/错版本仍在精确来源层拒绝，不能由“支持此类型”推导工具已获准。
- 教育私有参数/报告及明确绑定的 PLATFORM 报告通过真实投放元数据核对 runtime、owner、product、unit、指针与真实不可变 release 字节/状态。合法 Training 私有消费者保留原分支，不增加教育目录查询；不把 Survey 或任意 Training 私有模板借给学校。PLATFORM 参数仍走原 formal-reference 检查。
- 纯 Form BUNDLE 可以无测量 units；必须有真实非空运行单元/Form sections 和完整定义 hash，不能用空数组创建空测评或伪造心理分数。无 C/P/R 是明确未选，不补 latest。
- 新教育来源的 scientific provenance 在当前 START transaction 读取，不改用脱离事务的全局 source client。实际创建前再次核对同一 execution/组织/产品/SELF/来源policy/目标，普通已绑定回放在此之前保留。
- NEW_START 拒退役投放、不可新增的measurement和失效原issuer；已物化的 FROZEN 必须有真实 parent binding，不从客户端skip flag授予。当前账户、组织、同意及global emergency检查仍归原流程负责。
- account-mode原查询增加真实新投放metadata识别，避免新教育路径在组织锁后新增User锁；不是跳过账号有效性校验。

## 本地开发观察与未完成项

|检查|实际结果|边界|
|---|---|---|
|C/P/R新scope与原Training/standard直接合同|首轮3文件23PASS；随后新增2PASS/6filtered、1PASS/8filtered|不是最终整组重复通过；原始逐轮日志保留|
|纯Form BUNDLE|2PASS/17filtered|结构/reader合成测试，不是实际Form提交|
|COGNITIVE adapter|2PASS/5filtered|不是新工具发布或真实START完成|
|execution source新入/已有绑定|9PASS|数据库/authority mock，不能替代并发PG|
|完整迁移后的PG17受限runtime SQL|3PASS|真实新库完整migrate、非owner角色权限、实际新增SQL解析及不存在记录拒绝；没有正向发布/FINAL或并发验证|
|后端tsc|types-r9 exit0|之后新增PG测试文件需最终类型检查；不声称正式CI资格|

实际SQL检查使用新独立 loopback 数据库 pr363_source_start_test，PG17.11、受限非owner runtime role；不存在记录的随机UUID，不触及生产数据。未伪造CI-only环境，自有PG已停止。新库从全部迁移建成，不等于旧生产数据升级/恢复已经验收。最终目标PG16仍需对应正式环境资格。

原件在 runtime-source-evidence/；当前命令涉及的各脚本输入与输出保留dot本地。没有启动CI、合并或部署。

继续缺项：实际登记/审查/发布生产者，完整管理/参与/反馈挂载，源许可与原授权并发撤回、真实父子START/恢复/FINAL/报告、四入口五工具矩阵和最终CI。此提交是共享消费者接线，不是PR363完成。

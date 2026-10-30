# 精确授权的真实受限运行角色补验

基线 `f4a842b71306a6e4a5de08e0cb904b06f26f28b7`，仅新增测试/证据，不改权限脚本、
表策略或业务实现。另克隆 `precise_runtime_role_test_20261029`，原 COURSE 测试库
保留。按仓库原 operator 契约在该本地克隆创建 `precise_task1_runtime`：LOGIN、
NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS，并运行未修改的
`runtime-role-defaults.sql` 与精确 `runtime-table-policy.json`。没有弱化 guard、
授予 owner 成员资格、修改生产或其他已有测试库的 ACL。

随后 `runtime-role-contract.mjs verify-current` 用真实运行凭据验证成功：
267 张表、1 个序列、255 个迁移，fingerprint
`4bd42b7e74dff5c3999ce84425aee16ce10b27df2eda3c8450acf200fb8d164a`。
current_user 与 session_user 均为该受限角色，应用未使用 owner 或 SET ROLE 替代。
迁移账本 no-op UPDATE 实际返回 42501，255 条原账本完整相同。

两条真实 PostgreSQL/受保护 HTTP 用例首轮均通过，共 5 个 HTTP 请求：受限角色
能读取原 revision 7 的冻结完整报告；通过普通管理员路径把此前 8/REVOKED use
明确重新发行到 9，重复原请求只返回同一修订及一个审计事件，原请求回读完整。
已有 13 个任务、6 个用户、原完成 attempt/T3 binding 与源组合未改变，旧报告在
新修订发行后仍可读且本样本结果相同。没有新 START、交卷或重做素材计分。

Node 24.21.0 后端闭包类型检查退出 0。角色口令仅在本节点 0600 私有文件，用于
该隔离环境；Git、命令参数、日志和本文没有口令/连接串。
[raw](runtime-role-raw.json) 保留正式契约、命令/时间/退出码及实际断言；
[verification](runtime-role-verification.json) 记录脚本/源码 hash 与范围。

此处补的是 Training 精确授权与历史报告的一个受限角色代表路径，不能替代
School/Teacher/Survey 的同角色写入验收，或把此前 owner 执行改称 runtime 执行。
尚无实际浏览器 MFA、性能比较或正式 CI/PR/merge；不代表 main/生产部署。

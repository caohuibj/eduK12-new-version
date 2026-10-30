# 认知第一切片：不可变 profile 内容闭包

复用现有 `freezeAssignmentProfile`、v2 protocol、`selected-configuration` 身份和
`assessment_public_templates` 存储，添加明确的 `COGNITIVE_PROFILE_CONFIGURATION` kind。
闭包保存同一 config 下的精确 profile、resolved config/hash、完整冻结报告/指标/质量/展示与
protocol/signature；不包含授权对象、状态或每次作答 seed。内容解析不查当前 registry，
cache 命中后仍检查调用者提供的精确 expected identity；解析/hash 本身不授予权限。

新增 SQL 只扩展原模板 kind CHECK，原触发器、ACL、表结构、Prisma schema 和依赖不变。
尚未接线四入口的 grant、API、任务和 START，旧运行路径不消费新闭包。

## 实际结果

- 新契约单测 **7 PASS**，覆盖 experience/research 同 testType/config、不同冻结内容，
  保存后同名 profile 改变仍读原件、篡改/缺指标/协议不匹配拒绝、四产品独立 binding 指向同一共享内容、
  加密存储去重、cache 命中后的上下文/命名空间校验。四产品这一项是纯合同，不能当四入口权限已通。
- 初次类型检查发现 ES2020 的 Object.hasOwn 与 throw helper 的 nullable 收窄问题；
  保留原错误，只改为原型 hasOwnProperty 和明确函数声明。类型复验 0，直接受影响机械校验 case **1 PASS/6 filtered**。
- 从已保留 runtime fixture 建新独立克隆，仅应用新迁移。首次 guarded 包装的迁移阶段成功，
  postcheck 因本地包装误把 owner URL 作为 runtime URL 失败。先回读确认新库256/原库255，
  只修包装变量；实际受限角色 verify-current **0**，267表/1序列，未改任何 ACL。
  随后只补迁移幂等目标，正常 `prisma migrate deploy` 报无 pending，退出0；未重跑完整 seed 或已过角色检查。
- 实际 PostgreSQL **2 PASS**：正常安装 main reaction1.1.0 为 DRAFT，再经既有系统发布服务生成
  精确 COGNITIVE M；用该真实 config 保存 experience8/research60 两份闭包，重复保存不增加行。
  新 store 从数据库实际解密回读，原不可变触发器拒绝 UPDATE/DELETE（**55000**）。
  应用连接始终为 `precise_task1_runtime`，原6用户/4grants/13任务及原attempt/模板不变，未发任何用户权利。

原命令、日志、reporter、原失败、实际 config/M/artifact 身份见
[raw](cognitive-profile-artifact-raw.json)，hash/范围见 [verification](cognitive-profile-artifact-verification.json)。
这是独立合成库的工程验证；未给主材料库或生产发布 reaction，也未修改11个DRAFT候选。

## 证据影响

量表源码、前端 tree 未变，原尺度/页面证据保留原身份。
共享后端模板 kind 与迁移输入已经改变，旧编译后端不能改标为当前产物。
旧 kind 成员、解析/cache 主体与触发器/权限策略未改，未机械重跑量表矩阵。
所有本地证据仍为 unsigned，正式 CI 接纳和四入口 profile 生命周期尚未执行。

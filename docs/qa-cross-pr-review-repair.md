# 跨 PR 合同复核与修订

复核基线：`main@612443277bdb42a363a393cb4178042e1969a876`、PR #243 `63138ccc4409590454155b7c5d00945a357d5a06`。依据用户提供的跨 PR review，逐项核对源码和隔离数据。以下结论不代表生产服务器已经发生相同故障；本轮未连接生产、未部署，也未运行托管或自建 CI。

| 意见 | 核实结论 | 本次处理 |
| --- | --- | --- |
| 家长旧 `parentAudience` 兼容路径 | 实现问题成立：缺少独立发布行时，合法兼容 JSON 曾能充当来源；外围关系、同意、授权仍受检查 | 正式读取仅接受完整校验的独立发布记录，否则返回未发布。旧 JSON 不再赋予发布权限 |
| runtime role 与新增迁移 | 仓库内校验合同确实缺失；未实证生产缺权 | guarded migration 后和 release preflight 用独立运行凭据只读检查身份、表/序列/schema 权限与精确迁移身份；不补权、不借 owner 验证 |
| Run population freeze | 成立：未来关系和不可用账号可能进入冻结分母，实际 START 再拒绝 | 发布和当前历史权限共用 actor SQL；关系采用开始时间和结束时间窗口。发布前批量排除冻结、失效、过期、需改密码、未批准教师及显式 RUN_START deny |
| 课堂题号 | 成立：真实写路径从 1 开始，小结页面及无标题 fallback 多加 1 | 保留接口的 1-based ordinal，直接显示；数据库 fixture 使用第 1、2 题 |
| 注册资源全局 100 上限与 N+1 | 成立：无关资源也能阻断教师目录 | 单条 JOIN/EXISTS SQL 先按授权、发布状态及来源 hash 筛选，再分页。目录返回 nextPage，界面支持追加、去重及失败重试；复用正式 readiness 校验而不逐项重新读取 |
| 登录 timing oracle | 成立：不存在或不可登录账号跳过 bcrypt | 相同 bounded admission 内运行预计算 cost-10 dummy hash；dummy 比较成功也不能登录，基础设施异常仍为 503，不记作密码失败 |
| 注册资源与报告方案自审 | 属于治理选择，现统一采用独立审核 | 注册者及量表作者不能审核资源；方案创建者不能审核自己的方案。发布重新核对 reviewer，实际发布者可与创建者相同 |
| 备份恢复与 release 身份 | 证据合同改进，未发现新删除 blocker | 对迁移名称及 SQL checksum 的排序清单计算 SHA256，实际恢复账本必须精确匹配，拒绝缺失、多余、重复、改动和未结束迁移 |

## 运行角色部署合同

`DATABASE_URL` 用于迁移/运维；`DATABASE_URL_RUNTIME` 为同一数据库的独立运行角色。Compose 的 migrate 和 release-preflight 已传递后者。API/Worker 的 hardened overlay 保留原独立凭据设置。运行镜像携带只读检查器和迁移清单。

正式生产 `db:migrate:guarded` 的末尾检查及 `db:release:preflight` 在缺少运行凭据、角色不受限、权限不足或迁移身份不一致时失败。检查拒绝 owner/superuser/createdb/createrole/bypassrls/replication，包括通过角色成员关系获得的能力；检查 public schema USAGE、当前业务表 SELECT/I/U/D、序列 USAGE/SELECT，并要求迁移账本只读。DDL 与数据库/schema CREATE 不应由应用运行角色持有。新表自动纳入检查。

现有 owner-only CI 服务和本地 release code gate 是合成代码验证，不是生产运行角色证明。仅在 `NODE_ENV=test`、明确 CI 的 loopback `/ptool` 或本地 release 的 loopback `/eduk12_release`，缺少运行 URL 的数据预检可以继续原数据检查，但返回 `runtimeRoleVerified:false`；部署或独立 runtime 验证不能使用此例外。真实非 owner 正/负对照在临时数据库套件中执行，纳入共同 R5 入口。

自动审批拒绝了生产通用授权及隔离服务批量授权补丁，理由是尚未明确数据库、角色和授权范围。本次采用只读、失败关闭方案，未添加 `ALTER DEFAULT PRIVILEGES` 或自动补权程序。实际权限配置仍需发布前完成：核对真实创建对象的 migration owner、运行角色、需要读写的精确表/序列清单及现有 default privileges；缺权时制定最小授权差异，获得明确批准后执行，再用运行凭据重查。不要为了通过校验直接扩大不需要的权限，或把 owner URL 当作运行 URL。

## 既有数据与治理升级

- 旧家长 JSON 保留历史审计，缺少正式发布的报告不再能作为新的同意/授权来源。上线前只读盘点包含 parentAudience 且没有合法 publication head 的历史 artifact；不输出答案或报告内容。确有披露需求时重新经过模板预览、独立发布、学生同意及逐份授权，不自动 grandfather。
- 既有已发布的资源、报告和审核记录不自动重写或停用。新发布严格要求独立 reviewer。旧自审的 REVIEWED 资源重新登记会生成新 DRAFT 版本，重复登记该新草稿仍幂等，旧行及旧审计保留；旧自审的报告方案需创建新版本并独立审核。
- Run 的既有冻结 population、报告和作答不重新计算。新发布使用当前合法人口；有限且尚未结束的 membership 可正常进入，未开始或已结束的关系被排除。START 的事务锁、最后时点校验及冻结身份规则保留。
- 本次没有新增或改写 SQL migration，保留已审的 102 条迁移和前序兼容迁移。

## 备份证据的含义

receipt 将绑定 release sourceRevision、expectedMigrationFingerprint、恢复后的迁移指纹及源运行角色检查结果。源 runtime 检查失败或旧镜像缺检查器时只记录 NOT_VERIFIED，不停止数据库备份；数据库精确恢复失败仍不能进入 VERIFIED 或轮换本地副本。中断不被吞掉。

数据库 dump 不包含 PostgreSQL 角色，恢复 receipt 明确为 `runtimeRoleRestored:false`、`applicationReleaseReady:false`。源角色检查通过也不是恢复后应用就绪的证明。实际恢复发布还需要独立角色配置、用目标运行角色重验、同版本 API/Worker 验证。附件引用一致恢复及 COS 清理的既有保护保持不变。

本机无可用 Docker daemon，因此真实容器恢复、匿名卷回收及生产镜像构建仍待执行。现有容器门禁保留并增加错误 release 指纹的恢复拒绝/清理断言，没有用 native 验证替换它。本地另以真实 pg_dump/pg_restore、现有加密/解密及包校验实现完成隔离验证；dump 和数据计数使用同一导出 MVCC snapshot，精确恢复 102 条迁移，并验证错误密钥及错误 release 被拒绝。该证据只覆盖数据库/加密/版本合同。

## 验证记录

最终验证摘要记录在 [R5 进度](qa-round5-repair-progress.md)。原始本地日志位于 `validation-r5/cross-*`，源码及证据哈希清单绑定本次提交。前序 `review2-*` 保留其原提交含义，不充当当前提交的全量门禁。

本轮维持 Draft，提交包含 `[skip ci]`；成功 push 后停止。不合并、不部署、不启用 runner。正式生产权限盘点、Docker 恢复/构建和完整发布门禁仍是后续发布条件。

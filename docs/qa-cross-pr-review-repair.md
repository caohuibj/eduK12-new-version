# 跨 PR 合同复核与修订

复核基线：`main@612443277bdb42a363a393cb4178042e1969a876`、PR #243 `63138ccc4409590454155b7c5d00945a357d5a06`。依据用户提供的跨 PR review，逐项核对源码和隔离数据。首次修订未连接生产；`94e63726` 推送后，用户进一步授权继续修复，本次完成生产权限盘点和迁移账本权限收紧。没有部署 PR、运行生产迁移，也没有运行托管或自建 CI。

| 意见 | 核实结论 | 本次处理 |
| --- | --- | --- |
| 家长旧 `parentAudience` 兼容路径 | 实现问题成立：缺少独立发布行时，合法兼容 JSON 曾能充当来源；外围关系、同意、授权仍受检查 | 正式读取仅接受完整校验的独立发布记录，否则返回未发布。旧 JSON 不再赋予发布权限 |
| runtime role 与新增迁移 | 仓库内合同确实缺失；授权后证实生产业务表不缺权、default privileges 已配置，但迁移账本有多余 I/U/D | 生产仅撤销运行角色对迁移账本的非 SELECT 权限；补强只读门禁及可审查的显式 default privileges 操作脚本，不借 owner 充当运行身份 |
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

首次修订时自动审批拒绝通用授权补丁，因为数据库、角色和范围尚未明确；当时只提交只读、失败关闭的校验。用户随后明确授权继续，本次确认生产数据库 `eduk12_prod`、migration owner `ptool`、实际运行角色 `eduk12_runtime_v1`。该角色不是 owner 或高权限角色，业务表权限完整；`ptool/public` 已有未来表 SELECT/I/U/D 和序列 USAGE/SELECT 的 default privileges，因此没有给生产业务表补权或重设默认授权。

实际发现 `_prisma_migrations` 被旧通用授权赋予 SELECT/I/U/D。生产修复在事务中核对精确 DB、owner、角色后，只撤销该账本的 INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER，保留 SELECT；API 和 worker 各自实际运行凭据重验 121 张表通过。owner、其他业务 ACL、默认权限、应用镜像和服务均未改动。生产既有 100 条迁移的名称/checksum 与 PR 全部一致，无重复、未结束或未知迁移；PR 的 `20261007010000_cognitive_quota_lineage`、`20261007020000_assessment_workbench` 尚未执行，不能充当 PR release schema 就绪证明。

仓库检查现在连 TRUNCATE/REFERENCES/TRIGGER 也拒绝。新增显式 operator 脚本 `server-version/backend/scripts/runtime-role-defaults.sql` 记录未来对象授权合同，随 ops 镜像交付；只有确认 public 是专用应用 schema、审核完整作用域后才手动运行。示例使用受限权限的 PGSERVICE 配置，不能把密码写进命令或日志：

```bash
psql service=eduk12-migration -X -v ON_ERROR_STOP=1 \
  -v target_database=eduk12_prod -v migration_owner=ptool \
  -v runtime_role=eduk12_runtime_v1 \
  -f server-version/backend/scripts/runtime-role-defaults.sql
```

这不是本次生产执行记录：生产默认权限已正确配置，故未执行该脚本。脚本只作用于明确 owner 在 public 创建的未来对象，并保护既有迁移账本；不创建角色、不转移 ownership、不批量授权现存业务表。错误数据库、owner、角色或混合 owner 的 schema 会整笔回滚，运行角色本身不能成为 operator。default privileges 不能排除某张未来表；若重建迁移账本，必须重做账本收紧，再通过实际 runtime 门禁。现存业务表若缺权，应基于审核过的逐表最小差异授权；新环境需先完成角色、schema USAGE、连接权限和现存表的专门配置，不能把这个脚本当作完整 provisioning。

## 既有数据与治理升级

- 旧家长 JSON 保留历史审计，缺少正式发布的报告不再能作为新的同意/授权来源。上线前只读盘点包含 parentAudience 且没有合法 publication head 的历史 artifact；不输出答案或报告内容。确有披露需求时重新经过模板预览、独立发布、学生同意及逐份授权，不自动 grandfather。
- 既有已发布的资源、报告和审核记录不自动重写或停用。新发布严格要求独立 reviewer。旧自审的 REVIEWED 资源重新登记会生成新 DRAFT 版本，重复登记该新草稿仍幂等，旧行及旧审计保留；旧自审的报告方案需创建新版本并独立审核。
- Run 的既有冻结 population、报告和作答不重新计算。新发布使用当前合法人口；有限且尚未结束的 membership 可正常进入，未开始或已结束的关系被排除。START 的事务锁、最后时点校验及冻结身份规则保留。
- 本次没有新增或改写 SQL migration，保留已审的 102 条迁移和前序兼容迁移。

## 备份证据的含义

receipt 将绑定 release sourceRevision、expectedMigrationFingerprint、恢复后的迁移指纹及源运行角色检查结果。源 runtime 检查失败、旧镜像缺检查器或 60 秒探针超时时只记录 NOT_VERIFIED，不停止数据库备份；数据库精确恢复失败仍不能进入 VERIFIED 或轮换本地副本。人工中断不被吞掉。

数据库 dump 不包含 PostgreSQL 角色，恢复 receipt 明确为 `runtimeRoleRestored:false`、`applicationReleaseReady:false`。源角色检查通过也不是恢复后应用就绪的证明。实际恢复发布还需要独立角色配置、用目标运行角色重验、同版本 API/Worker 验证。附件引用一致恢复及 COS 清理的既有保护保持不变。

首次修订时本机没有 Docker daemon，只完成 native pg_dump/pg_restore 的 102 条迁移、加密认证和精确 release 验证。进一步授权后启动专用本地 Colima `r5-validation`，为正式容器恢复 fixture 增加 `--local` 入口：仅接受专用 Unix socket，拒绝 remote/context override、生产环境和冒充 CI；hosted 原入口的 root/CI 条件保持。两条入口共用全部真实恢复和清理断言，不能跳过失败回收或更改阈值。容器快照断言要求独占验证，不能与会产生临时容器的镜像构建同时运行。

独立执行还暴露冷启动等待的实现缺陷：单次 `docker exec pg_isready` 超时直接退出，未继续等待数据库启动。现保留每次最多 10 秒，将整体启动窗口明确限制为 monotonic 90 秒；暂时超时在窗口内重试，超过总期限仍失败并回收资源。真实加密 dump/恢复、错误 release 拒绝、损坏 checksum 拒绝及两种失败的匿名卷回收均通过；另放入非空保护容器及命名卷，证实未被误删。所有恢复/源 fixture/保护探针容器与卷均回收。

最终 backend `runtime` 和 `ops` 镜像本地构建通过。read-only、network=none 容器冒烟核对 runtime 为 UID 1000、缺运行凭据拒绝验证、102 条迁移指纹与源码一致，并核对两份校验器及 ops SQL 的 SHA256。镜像为本机 linux/arm64，未上传或部署；linux/amd64 生产镜像及安全扫描、完整 staging/发布门禁仍需正式执行。新备份等待逻辑也未部署到生产。专用本地 VM 和测试 PostgreSQL 验证后关闭，缓存与证据保留。

## 验证记录

最终验证摘要记录在 [R5 进度](qa-round5-repair-progress.md)。原始本地日志位于 `validation-r5/cross-*`，源码及证据哈希清单绑定本次提交。前序 `review2-*` 保留其原提交含义，不充当当前提交的全量门禁。

本轮维持 Draft，提交包含 `[skip ci]`；成功 push 后停止。不合并、不部署、不启用 runner。生产权限盘点及精确账本权限修复已完成；完整 release schema、目标平台镜像安全扫描、staging smoke 和合并门禁仍需按正式发布流程执行。

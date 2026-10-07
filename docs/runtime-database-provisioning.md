# Runtime 数据库首次配置、升级及灾备恢复

适用范围：专用应用数据库、public 应用 schema、明确 migration owner 和独立 runtime LOGIN role。操作须绑定目标数据库、同一 release 的 migration 文件与权限清单。不要在混合业务数据库直接运行；脚本遇到其他 owner 或未分类表会回滚。以下是人工 operator 流程，不由迁移脚本或 API 自动执行。

## 权限合同

`server-version/backend/scripts/runtime-table-policy.json` 是当前 release 的逐表清单：121 张 `RUNTIME_RW` 业务表、两个 `OPERATOR_ONLY` legacy 导入表、一个 `MIGRATION_LEDGER`。清单也支持 `RUNTIME_READ`，当前没有此类表。迁移增加表时必须在同一变更中分类；未知表不能凭名称推定为业务表。

运行角色只对 RUNTIME_RW 获得 SELECT/INSERT/UPDATE/DELETE，对 RUNTIME_READ 和迁移账本仅 SELECT；运维表没有运行时读写权。序列按其所属表分类，业务表序列仅 USAGE/SELECT，运维序列不可访问，独立无所属表的序列需要另行设计明确合同。角色不得拥有数据库/schema/表/序列、CREATE 或高权限成员资格。

`runtime-role-defaults.sql` 保留原文件名，但现为显式 ACL reconcile：撤销本数据库内指定 owner 对指定 runtime 的全局及 public future-table/sequence 默认授权，再仅对已存在且已分类的对象精确赋权。它不创建角色、不改 ownership、不改其他角色的授权。若 PUBLIC 或角色继承仍赋予运维表权限/账本写权，整笔回滚，须先审查继承来源，不能改用 owner 运行应用。新对象默认没有 runtime 权限；每次新增表或恢复后须重新 reconcile。

## 首次配置与恢复顺序

1. 固定经过审核的 release 镜像/源码、migration owner、runtime role 和数据库名称；API/Worker 保持停止。先在隔离目标验证备份解密与完整恢复，备份 receipt 的 `runtimeRoleRestored:false` / `applicationReleaseReady:false` 不代表应用可启动。
2. 使用受控的 operator 凭据创建目标数据库/owner，并创建独立 LOGIN runtime：NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOREPLICATION、NOBYPASSRLS，不授予 owner 成员资格。密码通过受控密钥管理配置，不放入 shell 参数、日志或本文。授予目标数据库 CONNECT 和 public USAGE；撤销 public 对非 owner 的 CREATE，复核数据库 CREATE 的有效权限。现有环境先盘点，避免重复创建或改动无关角色。
3. 恢复流程：按同版本、既有加密/完整性检查恢复 dump，明确将对象 ownership 映射到批准的 migration owner；dump 不含运行角色。空库流程：使用批准的 migration owner，先运行 `node scripts/pr24-migration-preflight.mjs`，再运行 `npx prisma migrate deploy`。恢复库若需升级，同样先做 guard，再部署精确 release 的迁移。保留每阶段日志；失败不得启动应用。
4. 执行下列 ACL reconcile，输入必须来自将要部署的同一 release。`PGSERVICE` / `PGPASSFILE` 应是权限受限的 operator 配置，连接角色必须是指定 owner；目标 role 不是 operator。首次配置时 `DATABASE_URL_RUNTIME` 可以已配置，但不能把 guarded migration 的 runtime 后置失败误称为 provisioning 完成。

   ```sh
   psql -X -v ON_ERROR_STOP=1 \
     -v target_database=reviewed_database \
     -v migration_owner=reviewed_owner \
     -v runtime_role=reviewed_runtime \
     -v table_policy="$(cat server-version/backend/scripts/runtime-table-policy.json)" \
     -f server-version/backend/scripts/runtime-role-defaults.sql
   ```

5. 用真实 runtime 凭据执行 `node scripts/runtime-role-contract.mjs verify-current`；分别复核 API/Worker 将使用的凭据，要求受限身份、按分类有效权限及精确 migration name+checksum 全部通过。正式 `DATABASE_URL_RUNTIME` / release preflight 检查同样不得跳过或以 owner 替代。ACL reconcile 本身不校验完整业务数据和迁移 fingerprint，不能作为发布成功依据。
6. 然后按正式发布流程运行 release 数据/内容门禁、启动同版本 API/Worker、核对健康与最小业务链路，保留 release SHA、权限清单 hash、迁移 fingerprint 及结果。最后确认新的备份/恢复证明。若需回退应用，先核对 schema/ACL 向后兼容；不自动回滚已迁移的数据库或恢复过宽权限。

## 既有环境升级

没有新增对象且已有精确 ACL 的升级可以继续使用 `npm run db:migrate:guarded`（guard → migrate deploy → runtime postcheck）。新增对象、首次配置或灾备恢复必须走上述 operator 分阶段流程，在 migrate 和 runtime postcheck 之间完成 reconcile；失败保持部署停止。不能通过清空生产 `DATABASE_URL_RUNTIME`、设置测试例外或更改校验器绕过缺权。

本次生产只读盘点确认两个 legacy 导入表仍存在过宽 runtime 权限。本轮仅提交修订，未在生产执行本脚本、迁移或部署。下一次正式部署之前应审查精确目标、撤销运维表运行权限和默认广泛授权，按上述顺序验证；生产旧版本健康不等于新 checker 已通过。

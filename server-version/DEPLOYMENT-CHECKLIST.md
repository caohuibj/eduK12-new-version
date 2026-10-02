# Huisurvey 生产部署检查清单

**这是全站生产部署的唯一操作入口。** 使用 `server-version/docker-compose.yml`；历史主机/PM2 指令位于 [archive](../docs/archive/prelaunch-legacy/README.md)，禁止用于当前 release。

## 1. 发布证据与停止旧写入

- [ ] 记录目标 main commit、精确镜像 ID、回滚 commit/镜像和恢复负责人。
- [ ] 在 Node 24.21.0 下完成 exact-SHA 门禁；本地证据不能替代尚未完成的 staging smoke。
- [ ] 支持客户端仅新版 Web；[历史小程序](miniprogram/README.md)不支持本 release。
- [ ] 核对启用内容的 DB lifecycle、科学/产品资格和对应版本门禁；fake 框架任务不可正式投放。
- [ ] 入口 drain，等待请求排空；停止所有主机上的旧 backend、worker/queue consumers、frontend。
- [ ] 保留并验证数据库、私有资产、Redis 和凭据交接卷的备份。worker 的受限关停与恢复见[领域 ops runbook](../docs/prelaunch-closure-v1/pr2-ops-runbook.md)。

本目录中的命令以 operator 已配置并审核的 `.env` 为前提；不得在终端输出凭据。

## 2. 数据恢复/迁移：先判断数据库 major version

当前目标 PostgreSQL 16 使用新 `postgres16_data` 卷。**PG14 升 PG16 必须先完成验证过的逻辑备份/恢复；不能把 PG14 目录挂给 PG16，也不能把启动的新空卷当作已恢复。**

- [ ] 若旧环境为 PG14，严格执行[PG14→16 逻辑备份恢复](../docs/prelaunch-closure-v1/pr2-ops-runbook.md#postgresql-14--16-upgrade)，保留旧卷供回滚。
- [ ] 如已经是 PG16，执行现有[备份/恢复工具](docs/BACKUP-RESTORE.md)，核对备份和恢复证据。
- [ ] 旧资产按 [Asset migration](docs/ASSET-MIGRATION.md) 做经过审核的 provider 转换；local 工具不可直接连接生产，remote COS 被 skip 不算完成。
- [ ] 核对历史/frozen 媒体引用、对象 hash、scope 和权限。只在真实数据验证完成后设置 `ASSET_MIGRATION_COMPLETE=true`。
- [ ] 不删旧报告、attempt、hash、token/asset migration reader 或历史队列；这些在数据恢复完成后的独立清理中评估。

## 3. 同一 checkout / 对应构建目标的升级顺序

以下仅适用于**已确认目标 PG16 有正确数据**的维护窗口。首次部署/major restore 先完成第 2 节，禁止直接复制这个命令块绕过恢复。

```bash
cd /opt/ptool/server-version
# 已 drain 全部入口；只停止应用，保留 postgres/redis。
docker compose stop frontend backend worker
# 使用现有备份工具生成并验证受保护的备份，然后再继续。
# 由同一 exact SHA 构建；backend 和 worker 共用 server-version-backend:latest（runtime target）；ops jobs 使用同一 checkout 的 ops target。
docker compose build backend worker frontend migrate checkin-token-backfill release-preflight
docker compose images backend worker migrate checkin-token-backfill release-preflight
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm checkin-token-backfill
docker compose --profile ops run --rm release-preflight
# 仅在上面每一步成功且数据/资产门禁通过后：
docker compose up -d --no-build backend worker frontend
```

- [ ] 确认 backend 与 worker 为同一个新 runtime 镜像 ID；ops jobs 必须来自同一 exact SHA 的 ops target，其镜像 ID 可与 runtime 不同。不得复用旧 consumer 或旧 ops 镜像。
- [ ] guarded migration 成功；`checkin-token-backfill` 是兼容名称，实际处理 questionnaire、check-in、composite、cognitive 四类。
- [ ] 四类 public token `remaining=0`；release-preflight 八个约束 `unvalidated=0`、`missing=0`，危险计数均为零。
- [ ] seed 只在明确需要并审核时运行；不得用 seed 代替恢复旧数据。
- [ ] frontend 生产构建不启用 UI lab。
- [ ] 启动 backend 与 worker，健康检查、管理员登录、Cookie/CSRF、私有资产能力正常。

`NOT VALID` 只跳过历史扫描，仍会拦截后续旧格式写入，所以停旧 writer 必须发生在 migrate 之前。本地 `release-verify-local.sh` 永不替 operator drain 生产。

## 4. Smoke、恢复流量与回滚

- [ ] 在入口仍关闭时，对启用的 questionnaire、check-in、composite、cognitive 各验一条新链接和恢复后的旧链接。
- [ ] 验证历史 completed report/frozen snapshot；新 FINAL 提交、旧 attempt 只读/必要 restart 均遵守各自契约。
- [ ] 非 DRAFT 问卷定义不可改；fake 不可新建/发布/新开始；无内容无历史任务的关系测评入口不展示。
- [ ] Run inbox 与历史 URL redirect 正常，空目录或不支持的小程序不作为产品承诺。
- [ ] smoke 通过才恢复流量，观察错误率、worker 恢复与数据库写入。
- [ ] 失败则继续停写，先判断 schema/data 兼容性；不得直接启动不兼容的旧 writer。PG major upgrade 回滚使用保留旧卷和审核备份。
- [ ] 留存 exact-SHA、镜像、备份/恢复、迁移/preflight、smoke 和回滚决定。

资源配额与实际主机验收见 [4C4G acceptance](docs/prelaunch-4c4g-acceptance.md)。该文件、Asset migration 和 ops runbook 都是领域子文档，不是第二个全站部署入口。

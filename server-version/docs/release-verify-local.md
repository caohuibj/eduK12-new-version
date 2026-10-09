> Historical full-platform checklist. For newly implemented scoped A/B application releases use `docs/release/README.md`; this remains applicable to C and its unchanged scientific/data/security/recovery contracts. Do not use it to silently weaken a selected check.

# 本地发布门禁（Fix-2）

> 这是隔离证据门禁，不是生产部署脚本。它只创建带有
> `eduk12-release-verify-*` 前缀的一次性 PostgreSQL/Redis 资源，绝不会停止或重启
> `ptool-*`。生产 operator 仍必须在运行 migration **之前**完成入口 drain，并停止
> 所有旧 backend、worker/queue consumer 和 frontend；`NOT VALID` 只跳过历史行扫描，
> 仍会拦截旧服务对明文 token 行的后续 UPDATE/INSERT。

GitHub Actions 暂不可用时，使用候选提交的完整 checkout 执行一次隔离验证：

```bash
cd server-version/backend
npm run release:verify:local
```

脚本会创建唯一命名的 PostgreSQL 14 和 Redis 7 容器及临时卷，运行迁移、seed、令牌回填、迁移幂等性检查、只读数据预检、缺失 uploads 目录 fail-closed 回归、后端/前端测试与构建、依赖审计、Compose 校验、生产 runtime 镜像构建，以及以非 root `node` 用户验证 uploads、credential handoff 和 exports 三个运行时写目录。测试进程运行在完整 checkout 中，因此 Cognitive golden/e2e fixture 不会被精简的 ops 镜像上下文遗漏。

默认报告写入 `/tmp/eduk12-release-verify-*`；可通过 `RELEASE_VERIFY_OUTPUT_DIR` 指定证据目录。报告只包含 SHA、工具版本、计数、测试汇总和构建日志，不写入生产凭据或数据库 URL。脚本只删除自身前缀的容器、卷和临时镜像，绝不会执行 `docker compose down` 或触碰现有 `ptool-*` 服务。

## 数据预检

后端提供只读命令：

```bash
npm run db:release:preflight
```

输出 JSON 计数并在以下任一项非零时返回失败：失败迁移、四类公开令牌仍有明文或缺失哈希/密文、重复作业历史版本、幂等回执表缺失、legacy `/uploads` 引用、资产根目录外文件，以及未验证的公开令牌约束。`UPLOAD_DIR` 缺失、不可读或不是目录时也会 fail-closed，而不是报告零个 legacy 文件。该命令可使用只读数据库账号执行；`UPLOAD_DIR` 用于检查本地资产目录。

生产发布顺序为：

1. 在入口/负载均衡处 drain public traffic，并停止旧 backend、worker/queue consumer 和 frontend；确认旧版本不再写数据库。
2. 备份数据库（并完成可读性/恢复检查）。
3. 在同一份新版本 checkout 上执行 guarded migration。
4. 执行 `npm run db:backfill:public-tokens`（旧的 `db:backfill:checkin-tokens` 别名仍可用），确认 questionnaire、check-in、composite、cognitive 四类均 `remaining=0`。
5. 使用挂载 `uploads_data:/app/uploads:ro` 的 `release-preflight` ops service 执行 `npm run db:release:preflight`；要求八个 public-token 约束全部已验证，且所有危险计数均为 `0`。
6. 使用同一 SHA 构建并启动新 backend/frontend；在恢复入口流量前，对每个已启用的 questionnaire、check-in、composite、cognitive public workflow 各 smoke 一条新/旧链接，并确认 legacy `/uploads` 已关闭。
7. 恢复入口/负载均衡流量，观察健康检查、错误率、队列和数据库写入。

标准 preflight 执行方式为：

```bash
docker compose --profile ops run --rm release-preflight
```

## CI 确定性

backend job 显式设置 `COGNITIVE_MODULE_ENABLED=true`、全部 PostgreSQL 集成测试 URL 和独立的测试假名化密钥。关键集成 suite 在 CI 或本地发布门禁环境缺少数据库 URL 时会在收集阶段失败，而不会被 Vitest 静默跳过；CI 还会解析 JSON 报告确认这些 suite 没有 skipped 测试。

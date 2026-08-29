# 本地发布门禁（Fix-2）

GitHub Actions 暂不可用时，使用候选提交的完整 checkout 执行一次隔离验证：

```bash
cd server-version/backend
npm run release:verify:local
```

脚本会创建唯一命名的 PostgreSQL 14 和 Redis 7 容器及临时卷，运行迁移、seed、令牌回填、迁移幂等性检查、只读数据预检、后端/前端测试与构建、依赖审计、Compose 校验和生产 runtime 镜像构建。测试进程运行在完整 checkout 中，因此 Cognitive golden/e2e fixture 不会被精简的 ops 镜像上下文遗漏。

默认报告写入 `/tmp/eduk12-release-verify-*`；可通过 `RELEASE_VERIFY_OUTPUT_DIR` 指定证据目录。报告只包含 SHA、工具版本、计数、测试汇总和构建日志，不写入生产凭据或数据库 URL。脚本只删除自身前缀的容器、卷和临时镜像，绝不会执行 `docker compose down` 或触碰现有 `ptool-*` 服务。

## 数据预检

后端提供只读命令：

```bash
npm run db:release:preflight
```

输出 JSON 计数并在以下任一项非零时返回失败：失败迁移、明文打卡令牌、缺失令牌哈希/密文、重复作业历史版本、legacy `/uploads` 引用、资产根目录外文件，以及未验证的打卡令牌约束。该命令可使用只读数据库账号执行；`UPLOAD_DIR` 用于检查本地资产目录。

生产发布顺序仍为：备份 → guarded migration → `npm run db:backfill:checkin-tokens` → 确认 `remaining=0` → `npm run db:release:preflight` → 验证新旧链接和 legacy `/uploads` 已关闭。

## CI 确定性

backend job 显式设置 `COGNITIVE_MODULE_ENABLED=true`、全部 PostgreSQL 集成测试 URL 和独立的测试假名化密钥。关键集成 suite 在 CI 或本地发布门禁环境缺少数据库 URL 时会在收集阶段失败，而不会被 Vitest 静默跳过；CI 还会解析 JSON 报告确认这些 suite 没有 skipped 测试。

# Milestone F Baseline Closeout Report v1

**状态：** CLOSED
**日期：** 2026-08-20

## 原始债务

Milestone D 登记的 approved baseline 为 5 个文件、8 个失败：

- 3 个依赖真实 PostgreSQL 的既有 check-in 测试套件；
- `scoringService.test.ts` 的解释/反馈契约不一致；
- `utils/cache.test.ts` 的 miss/expired 返回值契约不一致。

## 关闭动作

1. `fa0071b` 修复 scoring 与 memory-cache 的实际契约，不修改测试期望来隐藏失败。
2. Release Candidate 验证使用 Compose 内部 Postgres，执行 `prisma migrate deploy` 后运行真实 DB 测试。
3. CI backend job 增加同等 Postgres service、migration 和 full regression；并发 Cognitive 测试使用同一临时数据库显式开启。
4. backend ops 镜像复制标准 `vitest.config.ts`，确保容器验证不会因为缺失 globals 而产生误报。

## 结果

```text
32 test files passed
272 tests passed
0 skipped
0 new failure
```

## 复验命令

```bash
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm \
  -e NODE_ENV=test \
  -e JWT_SECRET=<test-only-secret> \
  -e DATA_ENCRYPTION_KEY=<64-hex-test-key> \
  -e COGNITIVE_INTEGRATION_DB_URL='${COGNITIVE_INTEGRATION_DB_URL:?set integration URL in the protected environment}' \
  --entrypoint npm migrate test
```

本机直接运行 `npm test` 而未启动 PostgreSQL 时仍会因环境缺失而失败；这不是被隐藏的通过条件。受支持的回归入口是 CI service 或 Compose ops test 命令。

# Milestone F Regression Report v1

**项目：** `caohuibj/eduK12-new-version`
**验证日期：** 2026-08-20
**验证范围：** Milestone E Cognitive 功能 + eduK12 既有仓库 + Docker 运行时

## 1. 结论

Milestone F 回归门禁通过，Release Candidate 可以交给 Milestone G 做发布审查。

本报告使用精确门禁口径，不把缺少数据库的本机运行结果当作回归失败，也不把跳过并发测试当作通过。完整命令在 Compose Postgres 上执行。

## 2. 测试结果

| 范围 | 命令 / 验证 | 结果 |
|---|---|---|
| Backend build | `npm run build` | PASS |
| Backend Cognitive | `npm run test -- --run src/__tests__/cognitive` | 22 files / 179 passed；并发文件默认跳过 |
| Backend full regression | Compose Postgres + migration + `COGNITIVE_INTEGRATION_DB_URL` | 32 files / 272 passed |
| Frontend typecheck | `npm run typecheck` | PASS |
| Frontend Cognitive | `npm run test:cognitive` | 11 files / 54 passed |
| Frontend production build | `npm run build` | PASS |
| Compose topology | `docker compose config` | PASS |
| Production images | `docker compose build backend frontend` | PASS |

## 3. Docker / 数据库验证

- Postgres、Redis、backend、frontend 均为 `healthy`。
- `prisma migrate deploy`：13 个迁移，无 pending migration。
- `seed`：管理员与 fake/reaction/memory/stroop 配置幂等 no-op。
- Cognitive 三类配置均有已发布版本，Release v1 的 `engineVersion` / `scoringVersion` 未被静默改写。
- Postgres 未发布 Host 端口，保持通过前端 Nginx 作为唯一 HTTP 入口的基线设计。

## 4. API / 数据冒烟

通过 `http://localhost` 入口验证：

- 登录返回 200，学生 Cognitive assignment 列表返回 200。
- Reaction、Memory、Stroop 已完成会话均可从 history 读取，状态为 `COMPLETED`，结果包含 metrics 和 `sim-k12-v0.1` reference。
- 数据库核对：Reaction 20/20、Memory 4/4、Stroop 4/4 trials；所有对应 `payload_encrypted` 均符合三段密文格式。
- migration、seed、服务重启后上述数据仍可读取。

## 5. 安全与范围

- Cognitive 试次保持 append-only，服务端负责 schema 校验、加密与评分。
- session ownership、history 隔离、版本缺失拒绝等已有 Cognitive security tests 通过。
- 本里程碑没有引入设备指纹、监控遥测、反作弊平台或临床解释。

## 6. 已知限制

- `reference` 使用模拟 K12 参考层，仅用于产品流程验证，不代表正式 K12 常模。
- 不提供临床解释或 composite cognitive score。
- 浏览器脚本需要独立的 Chromium/Playwright 运行时；本报告以真实 HTTP ingress、服务端结果、数据库密文和已存在 E2E 会话完成发布候选验证。

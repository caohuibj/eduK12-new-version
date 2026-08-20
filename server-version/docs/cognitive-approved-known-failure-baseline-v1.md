# Cognitive 已批准已知失败基线（Approved Known-Failure Baseline）v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch context:** `feature/cognitive-core`（merge dev 前的回归口径）
**登记日期:** 2026-08-19（D6.1 收口时正式登记）

> **当前状态（2026-08-20）：CLOSED。** 本页保留原始 8 failed / 5 files 的历史记录；
> Milestone F 通过 Compose Postgres + migration 的全量回归重新验证，32 个测试文件、272 个测试全部通过。
> CI 已固定同等数据库门禁，后续不得把缺少数据库的本机运行结果当作发布回归结果。

---

## 1. 目的

正式登记仓库级回归门禁的"已批准已知失败基线"，避免：
- 把"8 个既有失败"长期表述为"全部通过"或误判为 Cognitive 引入的 regression；
- Cognitive PR 顺手扩大成 Cognitive + Checkin + ScoringService + Cache 的大杂烩。

## 2. 原始基线内容（8 failed / 5 files，历史记录）

`npm test`（vitest run 全量）中，以下 **5 个既有、与 Cognitive 无关** 的文件存在 **8 个失败**，记为 approved baseline：

| 文件 | 根因（已核实） |
|---|---|
| `src/__tests__/integration/checkinIntegration.test.ts` | 直接 import 真实 Prisma，连 `localhost:5432`（compose postgres 未发布 host 端口）不可达 |
| `src/__tests__/scoringService.test.ts` | 同上（依赖真实 DB/服务） |
| `src/__tests__/security/checkinSecurity.test.ts` | 同上 |
| `src/__tests__/services/checkinTokenService.test.ts` | 同上 |
| `src/__tests__/utils/cache.test.ts` | `cache.get` 返回 `undefined` 而非 `null` 的既有行为断言差异 |

## 3. 基线关闭前的回归门禁口径（历史记录）

- **Cognitive regression: PASS** —— `npx vitest run src/__tests__/cognitive` 全部通过（含 D2–D6.1 新增测试；concurrency 集成测试默认跳过，除非设 `COGNITIVE_INTEGRATION_DB_URL`）。
- **Repository regression: PASS against approved baseline** —— `npm test` 的失败文件集合与 §2 基线**完全一致**（= 0 新增失败）；**不允许顺手修**这 8 个失败。
- **禁止表述**："all tests passed" / "全部测试通过"（在 baseline 未清零前不成立）。

## 4. 关闭记录

| 项目 | 关闭证据 |
|---|---|
| `scoringService.test.ts` | `fa0071b` 修复解释文本与总体反馈契约；全量测试通过 |
| `utils/cache.test.ts` | `fa0071b` 统一 miss/expired 返回 `null`；全量测试通过 |
| 3 个真实 DB 测试套件 | Compose Postgres + `prisma migrate deploy` 后全部通过 |
| Cognitive 并发集成 | `COGNITIVE_INTEGRATION_DB_URL` 指向 Compose Postgres 后 4/4 通过 |

关闭命令口径：

```text
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm -e NODE_ENV=test \\
  -e COGNITIVE_INTEGRATION_DB_URL=postgresql://ptool:ptool123@postgres:5432/ptool?schema=public \\
  --entrypoint npm migrate test
```

该命令在测试环境执行，不改变生产 Compose 的 Postgres Host 端口隔离。

## 5. 归属与后续

- 原始基线债务已由 **Baseline Test Debt Closeout** 完成；本页不再作为当前失败豁免。
- `feature/* → dev → main` 的 CI 统一使用 Postgres service + migration + full regression，必须保持 0 新增失败。
- 若后续新增失败，视为 **regression blocker**，不得重新扩大本基线来绕过测试。

## 6. 关联文档

- `cognitive-d1-foundation-report-v1.md`（首次定义 approved known-failure 基线）
- `cognitive-d2..d61-*-report-v1.md`（每阶段回归结果均以本基线为准）
- `cognitive-d61-hardening-report-v1.md`（D6.1 收口）

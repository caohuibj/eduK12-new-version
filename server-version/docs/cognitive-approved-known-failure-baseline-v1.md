# Cognitive 已批准已知失败基线（Approved Known-Failure Baseline）v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch context:** `feature/cognitive-core`（merge dev 前的回归口径）
**登记日期:** 2026-08-19（D6.1 收口时正式登记）

---

## 1. 目的

正式登记仓库级回归门禁的"已批准已知失败基线"，避免：
- 把"8 个既有失败"长期表述为"全部通过"或误判为 Cognitive 引入的 regression；
- Cognitive PR 顺手扩大成 Cognitive + Checkin + ScoringService + Cache 的大杂烩。

## 2. 基线内容（8 failed / 5 files）

`npm test`（vitest run 全量）中，以下 **5 个既有、与 Cognitive 无关** 的文件存在 **8 个失败**，记为 approved baseline：

| 文件 | 根因（已核实） |
|---|---|
| `src/__tests__/integration/checkinIntegration.test.ts` | 直接 import 真实 Prisma，连 `localhost:5432`（compose postgres 未发布 host 端口）不可达 |
| `src/__tests__/scoringService.test.ts` | 同上（依赖真实 DB/服务） |
| `src/__tests__/security/checkinSecurity.test.ts` | 同上 |
| `src/__tests__/services/checkinTokenService.test.ts` | 同上 |
| `src/__tests__/utils/cache.test.ts` | `cache.get` 返回 `undefined` 而非 `null` 的既有行为断言差异 |

## 3. 回归门禁口径（每阶段报告必须按此表述）

- **Cognitive regression: PASS** —— `npx vitest run src/__tests__/cognitive` 全部通过（含 D2–D6.1 新增测试；concurrency 集成测试默认跳过，除非设 `COGNITIVE_INTEGRATION_DB_URL`）。
- **Repository regression: PASS against approved baseline** —— `npm test` 的失败文件集合与 §2 基线**完全一致**（= 0 新增失败）；**不允许顺手修**这 8 个失败。
- **禁止表述**："all tests passed" / "全部测试通过"（在 baseline 未清零前不成立）。

## 4. 归属与后续

- 基线清理由独立任务处理：**Baseline Test Debt Closeout**（checkin/scoring/cache 等既有模块修复或显式标注），**不并入 Cognitive Backend PR**。
- 入口目标：`feature/cognitive-core → dev` 合入后，全量测试应最终回到 full PASS，或持续引用本基线并自动证明 0 新增失败。
- 维护：若某文件修复，更新本文件并从基线移除；若新增失败，视为 **regression blocker**（除非另行批准）。

## 5. 关联文档

- `cognitive-d1-foundation-report-v1.md`（首次定义 approved known-failure 基线）
- `cognitive-d2..d61-*-report-v1.md`（每阶段回归结果均以本基线为准）
- `cognitive-d61-hardening-report-v1.md`（D6.1 收口）

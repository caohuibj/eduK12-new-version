# Unified Assessment Bundle v1.0

本目录是 `feature/unified-assessment-bundle-v1` 的开工基线，对应《Unified Assessment Bundle v1.0 实施计划》。

V3.2（PR41–45）只交付了 UNIFIED 作答 / 交卷 / 聚合底座。Bundle 产品（契约、引擎、家长、授权 overlay、SafetyCase、七个 PUBLISHED 包）在 `origin/main@e932298` 上尚未开工。

| 文档 | 内容 |
|---|---|
| [00-git-baseline.md](./00-git-baseline.md) | Git 基线、ptool 运行时、release-verify 结果 |
| [01-gate-c-closeout.md](./01-gate-c-closeout.md) | Gate-C 测量与开新需求前的优化结论 |
| [02-frozen-branch-inventory.md](./02-frozen-branch-inventory.md) | `feat/mental-health-bundle-v1` 的 REUSE/ADAPT/REIMPLEMENT/IGNORE |
| [03-implementation-plan.md](./03-implementation-plan.md) | 本分支遵循的产品实施计划 |
| [04-next-session-handoff.md](./04-next-session-handoff.md) | 下周执行：Commit 3 目标与剩余 commit 检验标准 |

## 固定约束

- 只从最新 `origin/main` 开工；禁止整分支 cherry-pick `feat/mental-health-bundle-v1`。
- 一个大型 PR、多个语义 commit；`main` 有新提交时把 `origin/main` 合入本分支并重跑回归。
- 不实现 History Engine、Cross-Informant Analysis、实时 LLM、诊断或新心理计量综合分。
- 题目、翻译、评分规则不得由开发者编造；源文件不可得时只阻断对应 package。
- 测试与测量使用隔离 PostgreSQL；禁止 `docker compose down -v` 作用于共享 `ptool-*`。

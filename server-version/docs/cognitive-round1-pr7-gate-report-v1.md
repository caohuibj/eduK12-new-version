# Cognitive Round 1 — PR7 回归与发布门禁报告 v1

- 日期：2026-08-23（Asia/Shanghai）
- 分支：`test/cognitive-round1-pr7`
- 基线：`5048931`（PR5、PR6 已 `--no-ff` 合入本地 `dev`）
- 范围：Round 1 的 9 个 P0/P1 任务：Reaction、Memory、Stroop、Go/No-Go、CPT-X、N-Back、Corsi、SST、Task Switching
- 结论：PR7 自动化回归门禁首个切片通过；浏览器端完整教师/学生流程仍待后续 PR7 切片覆盖。

## 自动化合同覆盖

新增统一回归测试，逐任务校验：

1. Catalog 中每个 P0/P1 任务只有一个 `recommendedForCreate` 版本。
2. experience、standard、research 三档 Profile 合并后的配置均通过任务 schema。
3. 每任务至少两个主指标，且具备 `interpretable` 质量定义、导出标签和随机算法版本。
4. 报告引用的主/次指标均存在于冻结 Registry 定义。
5. 发布冻结保留 Profile、报告定义和随机算法版本。
6. research-long 数据字典键属于冻结 Registry，manifest 与 session 行包含随机算法版本。
7. 权威 Registry 与前端 Runner 不包含百分位或“参考位置 x/100”文案。
8. SST 的 experience、standard 档保留稳定性限制提示。
9. 前端能够解析全部 9 个 P0/P1 Runner。

## 验证结果

| 门禁 | 结果 |
| --- | --- |
| Backend `tsc --noEmit` | PASS |
| Backend Vitest | PASS：57 files，502 tests；另 1 file / 4 tests 按既有条件 skip |
| Frontend cognitive TypeScript | PASS |
| Frontend Vitest | PASS：29 files，106 tests |
| Docker Compose config | PASS |
| Docker build：backend / frontend / migrate / seed | PASS |
| Prisma migrate | PASS：20 migrations，无待执行迁移（重复运行） |
| Cognitive seed | PASS：9 个 P0/P1 推荐配置均存在且重复运行保持一致 |
| PostgreSQL / Redis / Backend / Frontend health | PASS |
| Backend `/ready` 与 Frontend HTTP smoke | PASS |

执行入口：

```bash
COGNITIVE_GATE_ENV_FILE=/path/to/gate.env ./scripts/cognitive-round1-regression-gate.sh
```

脚本在生产模式启动检查时强制使用明确的本地 CORS origin；可通过 `COGNITIVE_GATE_CORS_ORIGIN` 覆盖。它不会接受旧环境文件中的 `CORS_ORIGIN=*` 作为发布门禁条件。

## 本轮发现并关闭的问题

第一次 Docker 启动时，旧 gate 环境文件提供了 `CORS_ORIGIN=*`，backend 按生产安全规则拒绝启动。门禁脚本已改为显式注入固定 origin。随后从 TypeScript、完整测试、镜像构建、迁移、seed 到健康检查全部重跑并通过。

## 非阻断警告与后续工作

- 当前 Docker 环境缺少 buildx 插件，Compose 回退到 classic builder；镜像构建结果有效，但构建速度较慢。
- Backend 生产依赖审计报告 25 个既有漏洞（14 moderate、11 high），应另开安全升级工作，不在本切片自动执行可能破坏兼容性的依赖修复。
- Frontend 安装时提示 `@testing-library/jest-dom@6.10.0` 声明 Node.js 22+，当前镜像为 Node.js 20；本轮 typecheck、测试和生产构建均通过，需后续统一工具链版本。
- PR7 尚需补齐并留证：管理员/教师创建（含 Profile）→ 学生完成任务 → 结果与历史 → summary / research 导出的浏览器端完整流程。

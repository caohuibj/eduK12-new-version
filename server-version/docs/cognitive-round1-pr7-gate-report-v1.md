# Cognitive Round 1 — PR7 回归与发布门禁报告 v1

- 日期：2026-08-24（Asia/Shanghai）
- 分支：`test/cognitive-round1-pr7`
- 基线：`5048931`（PR5、PR6 已 `--no-ff` 合入本地 `dev`）
- 范围：Round 1 的 9 个 P0/P1 任务：Reaction、Memory、Stroop、Go/No-Go、CPT-X、N-Back、Corsi、SST、Task Switching
- 结论：PR7 发布门禁通过。自动化合同、全量测试、Docker 发布链路和真实浏览器教师/学生闭环均已留证。

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
10. 9 个 P0/P1 评分器的完整输出与 `cognitive-scoring-golden-v1.json` 金标一致，覆盖 score、metrics 和 qualityFlags。

## 验证结果

| 门禁 | 结果 |
| --- | --- |
| Backend `tsc --noEmit` | PASS |
| Backend Vitest | PASS：58 files，503 tests；另 1 file / 4 tests 按既有条件 skip |
| Frontend cognitive TypeScript | PASS |
| Frontend Vitest | PASS：29 files，106 tests |
| Docker Compose config | PASS |
| Docker build：backend / frontend / migrate / seed | PASS |
| Prisma migrate | PASS：20 migrations，无待执行迁移（重复运行） |
| Cognitive seed | PASS：9 个 P0/P1 推荐配置均存在且重复运行保持一致 |
| PostgreSQL / Redis / Backend / Frontend health | PASS |
| Backend `/ready` 与 Frontend HTTP smoke | PASS |
| 9 任务评分金标 | PASS：完整 score / metrics / qualityFlags 固定输出 |
| 真实浏览器角色流程 | PASS：教师选择 Profile 创建并发布 → 学生练习及 40 个正式试次 → 结果与历史 → 教师导出 |
| 发布冻结与试次持久化 | PASS：Profile、配置 hash、配置/报告快照均冻结；Session 完成；正式试次 40，练习不入库 |
| 导出校验 | PASS：匿名 summary CSV、research ZIP、research XLSX；manifest、文件集合、sheet 集合及版本/Profile 一致 |

执行入口：

```bash
COGNITIVE_GATE_ENV_FILE=/path/to/gate.env ./scripts/cognitive-round1-regression-gate.sh
```

`COGNITIVE_E2E_NODE` 可省略并使用当前 `node`。浏览器控制依赖已固定在 backend 开发依赖中；脚本优先使用 Playwright 已安装的 Chromium，再检查 macOS/Linux 常见 Chrome/Chromium 路径，也可用 `COGNITIVE_E2E_BROWSER_EXECUTABLE` 显式指定。脚本在生产模式启动检查时强制使用明确的本地 CORS origin；可通过 `COGNITIVE_GATE_CORS_ORIGIN` 覆盖。它不会接受旧环境文件中的 `CORS_ORIGIN=*` 作为发布门禁条件。

## 浏览器闭环证据

最终连续 gate 创建并完成：

- Assignment：`b4973448-082c-4922-8f15-ea78fc4cc8ba`
- Session：`abdfb6ab-d1d7-4989-9389-076f3255fefa`
- 任务：Go/No-Go `1.0.0`，Profile `experience`，Profile definition `1.0.0`
- 数据库：Assignment `PUBLISHED`，Session `COMPLETED`，配置/报告/配置 hash 全部冻结，正式试次共 40 条

页面证据位于 `docs/e2e-round1-screenshots/`：教师 Profile 创建、发布完成、学生正式试次、学生结果、学生历史和教师导出入口。浏览器脚本同时断言结果页不存在百分位或“参考位置”文案，并对下载内容做结构及匿名化校验。

## 本轮发现并关闭的问题

1. 第一次 Docker 启动时，旧 gate 环境文件提供了 `CORS_ORIGIN=*`，backend 按生产安全规则拒绝启动。门禁脚本已改为显式注入固定 origin。
2. 浏览器 gate 首次并入完整链路时，测试地址使用 `localhost`，与固定 CORS origin `127.0.0.1` 不一致；已统一默认地址，并把登录跳转等待调整为适合 Docker 冷启动的 60 秒。
3. 连续复跑浏览器 gate 时，复用中的 backend 会保留进程内登录限流计数；发布 gate 现强制重建运行容器，保证每次从干净进程状态开始。
4. 修订后从 TypeScript、完整测试、镜像构建、迁移、seed、健康检查到浏览器角色流程全部连续重跑并通过。

## 非阻断警告与后续工作

- 当前 Docker 环境缺少 buildx 插件，Compose 回退到 classic builder；镜像构建结果有效，但构建速度较慢。
- Backend 生产依赖审计报告 25 个既有漏洞（14 moderate、11 high），应另开安全升级工作，不在本切片自动执行可能破坏兼容性的依赖修复。
- Frontend 安装时提示 `@testing-library/jest-dom@6.10.0` 声明 Node.js 22+，当前镜像为 Node.js 20；本轮 typecheck、测试和生产构建均通过，需后续统一工具链版本。

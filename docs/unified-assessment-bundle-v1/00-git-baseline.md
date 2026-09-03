# Git 与运行时基线

记录时间：2026-09-03（本地）。SHA 以 Git 为准。

## 仓库

| 项 | 值 |
|---|---|
| Canonical repo | `/Users/Qiang/Documents/eduK12-dev` |
| Remote | `https://github.com/caohuibj/eduK12-new-version` |
| 开工分支 | `feature/unified-assessment-bundle-v1` |
| 远端同名分支 | 创建时不存在 |
| `main` / `origin/main` | `e93229878428700fe932918b0940c9ae051e68bd` |
| ahead/behind | `0 / 0` |
| working tree | 干净（文档提交前） |

最近合入、作为 Bundle 底座而不是 Bundle 产品本身：

| PR | SHA | 标题 |
|---|---|---|
| #45 | `e932298` | V32-4 detach aggregate finalization + Cognitive/Form admission |
| #44 | `ddc982e` | freeze unified Scale admission |
| #43 | `662f1a2` | isolate background workers from submit |
| #42 | `1f6bdf4` | V32-2 closed aggregate |
| #41 | `3a71889` | V32-1 Unified Unit Runtime |

`main` 上不存在：`AssessmentBundleDefinitionV1`、`FrozenAssessmentBundleSnapshotV3`、`EvidenceItemV1`、`BundleReportFactsV1`、`BundleContextFactsV1`、`BundleAnalysisEngineRegistry`、`PARENT` 角色、`SafetyCase`、WHO-5/SDQ/TEXI 包。

## 冻结参考分支（只读 inventory）

| 项 | 值 |
|---|---|
| 本地分支 | `feat/mental-health-bundle-v1` @ `bba5cdf` |
| 远端 | 未推送 |
| merge-base with main | `85108c4`（PR #30，2026-08-30） |
| freeze 独有 commit | 1 |
| main 领先 freeze | 56 commits（含全部 V3.2） |

禁止 cherry-pick。重叠路径与分类见 [02-frozen-branch-inventory.md](./02-frozen-branch-inventory.md)。

## 共享 compose / ptool

Gate-C 与基线核验均未对 `ptool-*` 执行 `docker compose down` 或 `-v`。

| 容器 | 核验时状态 | 说明 |
|---|---|---|
| `ptool-frontend` | Up 2 days, healthy | 镜像 `server-version-frontend` |
| `ptool-backend` | Up 2 days, healthy | 镜像 `server-version-backend:latest`，Created `2026-08-29T08:32:34Z`，**不是** `e932298` |
| `ptool-postgres` | Up 2 days, healthy | volume `server-version_postgres_data` |
| `ptool-redis` | Up 2 days, healthy | volume `server-version_redis_data` |

其它既有卷：`server-version_uploads_data`、`server-version_credential_handoff_data`。不得假设正在跑的 ptool 镜像来自最新 main。

## 本任务隔离资源

| 资源 | 处置 |
|---|---|
| Gate-C 候选进程 `127.0.0.1:3313` @ `e932298` | 已停止 |
| 容器 `eduk12-gate-c-pg` / `eduk12-gate-c-redis` | `docker stop`，未 `rm -v` |
| volume `eduk12-gate-c-pgdata` | 保留 |
| 历史 Gate-A/B volumes | 未删除 |
| 原始结果 | `/tmp/eduK12-gate-c-4c4g/results/`（不入库） |

## 学生加入课程（计划第 3 节核对）

`UserRole` 仍为 `STUDENT | TEACHER | ADMIN`，无 `PARENT`。

`courseController` 学生凭码加入课程时，新建或恢复成员状态为 `CourseStudentStatus.ACTIVE`，不是审批流。家长审批不得依赖「学生审批字段」。有效 roster 目前按 `ACTIVE | APPROVED` 识别。

## 完整基线测试

权威结果：GitHub Actions on `e932298` **success**  
https://github.com/caohuibj/eduK12-new-version/actions/runs/33696918145

| Job | 结论 |
|---|---|
| backend (ci + migrate + build + full regression) | success |
| frontend (lint + typecheck + full tests + build) | success |
| docker (compose config + production builds) | success |
| codeql | success |

本地 `release-verify-local.sh`（隔离 PG/Redis，未碰 `ptool-*`）：

| 项 | 结果 |
|---|---|
| 命令 | `bash server-version/scripts/release-verify-local.sh` |
| SHA / 分支 | `e932298` / `main` |
| 报告目录 | `/var/folders/5y/qm057xnx7f39x931vbx1bkg40000gn/T/eduk12-release-verify-20260903-004123-32255` |
| exit code | 1 |
| 临时 Docker 资源清理 | true |
| 后端 | 155 files passed / 1 failed；1061 tests passed / 1 failed |
| 失败用例 | `aggregate-report.postgres.integration.test.ts`：200 路完成墙钟 10311 ms，断言 `< 10000` |
| 隔离复跑同一用例 | 2/2 通过（约 2.2 s）；日志有 write-conflict retry，最终全部 COMPLETED |
| 前端 `npm test` | 60 files / 218 tests passed |

该失败是全量串行套件下的墙钟抖动，不是正确性回归。不为此改 Prisma pool、不放宽成新的 SLA、不开 V3.2 修复 PR。GitHub CI 已在同一 SHA 上绿。

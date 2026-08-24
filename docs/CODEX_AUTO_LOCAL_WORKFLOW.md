# eduK12 本地 Sol/Luna 工作流

本项目使用 ChatGPT App 作为模型运行时，使用本地 Git 作为变更证据层。不需要 OpenAI API
key、GitHub、`gh` 或 GitHub Actions。

## 固定角色

- Sol：`gpt-5.6-sol`，`high`，负责项目分析、Task Contract、planning 和独立 review。
- Luna：`gpt-5.6-luna`，`max`，负责 Contract 范围内的实现和修复。
- App 必须按 `.codex/config.toml` 与 `.codex-auto/orchestrator.yml` 使用这两个精确路由；
  无法创建 `luna_implementer` 或模型不匹配时停止，不静默替换。

## 第一次检查

在 ChatGPT/Codex App 中把本目录作为 primary folder，并选择 Sol 模型。然后确认：

```text
.codex-auto/project.yml             protocol v2，repository_mode local-git
.codex-auto/orchestrator.yml        github: null，base_branch: dev
.codex/config.toml                  Sol high，Luna max
.codex/agents/luna-implementer.toml named luna_implementer，Luna max
```

项目根目录 `AGENTS.md` 和 `.agents/skills/codex-auto/SKILL.md` 会自动说明工作规则。不要把
`.codex-auto/.env` 或运行时结果提交到 Git。

## 一个任务的入口

Sol 先把请求写成 `.codex-auto/tasks/<task-id>.yml`，只列出本次范围、排除项、验收标准和验证名。
然后按顺序执行：

```text
./.codex-auto/bin/codex-auto app-start \
  --config .codex-auto/orchestrator.yml \
  --task .codex-auto/tasks/<task-id>.yml \
  --repo-path . \
  --session .codex-auto/results/<task-id>/session.json \
  --packet .codex-auto/results/<task-id>/packet.json

./.codex-auto/bin/codex-auto app-accept-plan --config .codex-auto/orchestrator.yml --repo-path . \
  --session .codex-auto/results/<task-id>/session.json \
  --plan .codex-auto/results/<task-id>/plan.yml

./.codex-auto/bin/codex-auto app-begin-implementation --config .codex-auto/orchestrator.yml \
  --repo-path . --session .codex-auto/results/<task-id>/session.json

./.codex-auto/bin/codex-auto app-record-change --config .codex-auto/orchestrator.yml \
  --repo-path . --session .codex-auto/results/<task-id>/session.json

./.codex-auto/bin/codex-auto app-begin-review --config .codex-auto/orchestrator.yml \
  --repo-path . --session .codex-auto/results/<task-id>/session.json

./.codex-auto/bin/codex-auto app-submit-review --config .codex-auto/orchestrator.yml \
  --repo-path . --session .codex-auto/results/<task-id>/session.json \
  --review .codex-auto/results/<task-id>/review.yml
```

如果 review 为 `CHANGES_REQUESTED`，先执行 `app-begin-fix`，由 Luna 在同一任务分支完成修复，
再执行 `app-record-fix`，之后重新由 Sol review。最多 2 个 fix cycle。

## 本地证据

`app-record-change` 和 `app-record-fix` 会重新运行 Contract 中的验证，并要求：

- 当前分支是 `codex-auto/<task-id>`；
- 工作树干净；
- 分支从 Contract 固定的 `dev` base SHA 派生；
- diff 非空；
- 所有必需验证均为 `PASS`。

通过后状态为 `CHANGE_READY`，review 通过后状态为 `INTEGRATION_READY`。这只表示变更已经
达到人工 integration 门槛，不会自动 merge、rebase、cherry-pick、push 或部署。

## 验证命令

当前配置的验证名及用途：

| 名称 | 命令 | 备注 |
|---|---|---|
| `backend-build` | backend TypeScript build | 必须通过 |
| `backend-unit` | backend Vitest 全套 | 当前 542 tests 通过；测试框架中的 skip 不等价于 DB 集成通过 |
| `backend-integration` | `scripts/codex-auto-backend-integration.sh` | 必须设置 `COGNITIVE_INTEGRATION_DB_URL`；缺失时明确失败 |
| `frontend-typecheck` | frontend cognitive typecheck | 必须通过 |
| `frontend-cognitive` | cognitive tests | 当前 101 tests 通过 |
| `frontend-build` | Vite production build | 必须通过 |
| `docker-config` | Docker Compose config | 只检查配置，不启动服务 |

需要运行 backend cognitive 并发集成测试时，先准备真实 Postgres，并在当前终端设置：

```text
COGNITIVE_INTEGRATION_DB_URL=postgresql://<user>:<password>@<host>:<port>/<database>
```

该变量只在本地终端使用，不写入仓库文件。集成测试需要已迁移并准备 seed 数据库。

## 停止规则

以下任一情况都停止当前任务并报告证据：工作树不干净、base SHA 改变、验证失败或未运行、
Contract 超出项目范围、Sol/Luna 路由不匹配、或达到最大 fix cycle。项目文档和 memory 可以
帮助导航，但不能替代实际 Git diff、命令输出和 review 结果。

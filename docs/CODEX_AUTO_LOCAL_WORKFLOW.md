# eduK12 本地 codex-auto 工作流

本项目使用 ChatGPT App 作为模型运行时，使用本地 Git 作为变更证据层。项目配置位于
`.codex-auto/project.yml` 和 `.codex-auto/orchestrator.yml`，不会读取或提交 `.env`、运行时
凭据、任务结果或审计文件。

## 验证门

常规变更要求 backend build/unit、frontend typecheck/cognitive/build。涉及 backend API、
持久化、认知 session/scoring、导出、加密或授权行为时，额外要求
`COGNITIVE_INTEGRATION_DB_URL` 指向隔离 PostgreSQL 的 backend integration；未配置时门脚本
必须明确失败，不得把跳过当作通过。用户可见流程、Docker、依赖、运行时或静态资源变更按
项目配置触发相应 E2E 或 Docker 门。

## 集成边界

变更必须从当前 `dev` 基线开始，保留 Auth/User 为唯一身份系统、Cognitive Registry/Runner
边界、Session 配置快照、版本字段、随机 seed 和 raw trial 持久化。不得自动 merge、push 或
部署；完成后由人工进行 integration gate。

## 集成数据库

需要真实数据库集成验证时，只在当前终端设置 `COGNITIVE_INTEGRATION_DB_URL`，使用隔离的
临时 PostgreSQL。不要使用共享开发库执行破坏性测试，也不要把连接字符串、密码或密钥写入
仓库文件。

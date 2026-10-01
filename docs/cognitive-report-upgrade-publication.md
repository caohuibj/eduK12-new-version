# Cognitive 报告升级：同步与发布准备

日期：2026-10-01（Asia/Tokyo）。用户已确认 GitHub 上其他开发完成合入，要求 push 全部本地成果并触发 CI；原暂停条件解除，合入仍须满足 CI 和仓库门槛。

## 同步结果

- 原 review 基线：`f70078adcd7c1220f205559e34cd3d719b3b6ce4`。
- 最新远端 main：`9dd4b301bdf5e1957a138fd56e52d067e0bfa774`，包括量表 Wave1 内容、参考数据治理和相关 CI 更新。
- 本轮完整实现：`f26223b5`（方案）、`48567293`（冻结解释与图表）、`ad981c37`（个体科普版与后台专业版）。
- 同步提交：`6a35be40f860805a1d728113e559bdf0080bfb3c`；双方修改文件交集为空，无冲突合入。
- 分支：`feat/cognitive-report-upgrade-local`。本记录在分支 push 前保存；实际远端状态以 GitHub 分支与后续 PR 为准。

检查了共用 canonical unit、参考绑定、reporting 结果源和前端 reporting 类型。远端新增量表参考字段及治理逻辑，不要求改变 cognitive 评分和冻结报告；共用路径已纳入本轮兼容回归。没有改写远端量表内容或仓库 CI 工作流。

## 同步后的验证

| 检查 | 结果 |
|---|---|
| Backend cognitive、assessment-runtime、reporting | 104 文件、761 项通过；6 文件、29 项 opt-in 测试跳过，未计为通过。 |
| 报告真实 PostgreSQL 定向检查 | 2 项通过，验证提交、冻结回放、归属读取和拒绝无权限用户；与 opt-in 范围有所重叠，不相加。 |
| Frontend cognitive、reporting、教师任务编辑 | 57 文件、258 项通过。 |
| 构建、类型与契约 | 前后端构建、Frontend typecheck、cognitive contracts 通过。 |
| Frontend lint | 0 errors，112 条既有 warnings。 |
| 浏览器预览 | 36 合成作答 × 两版 × 3 宽度，共 216 组合通过；15 张截图、2 份 PDF。 |
| CI 路由与工作流契约 | 24 项通过；本变更被分类为完整平台 gate，正式 PR 触发完整 CI。 |

远端新增的两份 migration 已应用到 disposable 本地测试数据库，并刷新 Prisma Client；未操作生产或部署数据库。验证日志在当前实例 `/workspace/cognitive-report-dev/publication/`，不提交可能含运行环境细节的原始日志。样稿与可复现命令见 [两版交付说明](cognitive-report-audiences-implementation.md)。

## 远端执行条件

HTTPS Git fetch 已成功。当前环境允许 `github.com`，但不允许 `api.github.com`；GitHub CLI 的仓库 REST 和 GraphQL 请求均返回 Forbidden，因此 API 访问是创建 PR、查询 CI 与合入的当前阻塞。

已通过支持的环境配置工具保存网络草稿，在已有域名清单上仅增加 `api.github.com`，保留既有安装、启动和其他设置。草稿保存不等于运行时生效；须在环境设置保存此访问变更，之后重新验证 API 和已有注入身份。未索取或输出凭据，未绕过网络代理。

本仓库 CI 的 push 事件仅监听 main，工作分支 push 本身不会启动 CI。须创建面向 main 的非 draft PR，才能触发完整门槛；不直接推送 main 来代替 PR 验证。CI 或保护要求未通过时不合入。

后续顺序：push 工作分支 → 创建并附加 PR → 跟进同一最终提交的 CI → 满足当前保护要求后 merge → 查看 main 的 post-merge integrity smoke。用户对这些步骤的条件授权已生效，无需重复询问。

业务测验重新发布或历史迁移仍是独立生命周期事项，本轮 GitHub 合入不执行它们。

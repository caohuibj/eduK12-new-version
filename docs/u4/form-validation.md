# Form 候选的受影响验证

仅隔离本地验证，不是 GitHub CI、生产验收或科学效度证据。环境 Node 24.19.0、Vitest 4.1.11、Prisma 5.22.0；仓库当前 engines 要求 Node ≥24.21.0，正式 CI 锁定环境尚未激活。共享已有锁定依赖，Prisma client 在独立复制的依赖目录依据本候选 schema 生成，未改原工作区 client；无 schema / migration / lockfile / CI 修改。

一次性 PostgreSQL 16.15 容器，loopback-only，数据库 `u4_test`，仅合成身份和响应。按现有 integration-env 隔离守卫运行，先应用仓库既有迁移。无生产读写，无正式题本发布。

| 受影响检查 | 实际结果 |
|---|---|
| 新 U4 描述合同 | 6 passed：53 个候选定义与原生编译、0/NA/U/拒答/跳过、完整题均值、配置拒绝、不同分母、隐私策略、比较身份 |
| student-composition collector | 4 passed：旧源完整性与隐私、可选两题逐人完整均值、NA 导致不计算及有效人数抑制 |
| shared Form foundation | 53 passed：冻结基线 oracle、纯模块依赖约束 |
| Form V2 与 student overlap | 10 passed（与 collector 同次受影响回归），旧缺失语义、跨批次边界 |
| 教师 U4 真实 HTTP / PG | 1 passed：候选创建、单专题固定、一叶 SELF 投放、原生 FINAL、草稿后改不影响冻结均值规则、本人报告、他人与撤权拒绝 |
| 学生 U4 真实 HTTP / PG | 1 passed：20 学生、单专题、真实 FINAL、活动关闭后教师统计；10 有效/5 NA/5 U，50% 有效类别频率、25% NA 提交比例、完整题均值 2；个人报告仅完成、教师不可读个人答案 |
| 旧 mixed SELF 真实 HTTP / PG | 1 selected passed，2 deliberately unselected：旧 Scale/Form 反馈与源版本、权限、FINAL 重放；无配置 Form 仍 completion-only |
| 前端受影响四文件 | 17 passed：Studio 原有创建/加载、共享类型合同、候选明确选择只创建一次、0 与缺失展示、两分母与抑制 |
| 后端 TypeScript / 前端 app TypeScript | passed；新 PG 测试纳入后另行完成最终后端类型检查 |

未启动全平台测试、Docker 应用镜像、完整浏览器或生产部署。真实 HTTP 验证不是浏览器端到端验收。观察和 K–2 是原生定义编译检查，未声称完整真实施测验收。

## 首轮失败与定向处理

- 初始后端类型检查发现复用工作区 Prisma client 落后于最新 main，以及新 helper 的 never 控制流声明。独立复制依赖后按最新 schema 生成 client，helper 改为显式函数；随后类型检查通过。没有变更数据库 schema。
- 初始前端类型检查发现旧“抽取前定义完全相等”测试未排除本次新增 optional descriptive 字段；保留旧核心严格相等并另行断言新增 optional 合同，随后通过。
- 首轮 U4 单测 2 failed：数组断言只列一个类别、误把可配置 STANDARD 方案当作默认严格小单元方案。改断言及 fixture 选择后 6 passed；未放松生产隐私逻辑。
- 新可选均值 collector 测试首轮失败：fixture 浅复制共享 options，重复插入 NA。改为独立深复制，生产验证规则保持严格。
- 受影响共享 Form 基线首轮 1 failed：新纯描述模块未登记依赖白名单。只增加 `form/definition.ts -> ./descriptive` 精确边，数据库/HTTP/入口适配依赖禁令保持；53 passed。

## CI / 合并边界

本次包含共享 Form 合同、实际报告与 UI 业务逻辑，不能使用纯内容或 backend-only 路由。现有 Draft legacy route 会重复本地通过项并启动附带宽范围任务，当前没有本候选的精确证据接纳路径。按用户限定受影响检查与仓库 AGENTS.md 的“本机已实际通过、输入仍一致的检查，CI 不得复测”，提交保持 Draft 并显式 `[skip ci]`，仅提交审阅，不声明 CI 通过或可合并。

正式 CI 激活前仍须审阅精确 base/head/tree、受影响检查与复用边界；本 PR 不改 CI 路由，不跳过合并要求，也不转 Ready。GitHub 对此标记的检查维持 pending 而非 success，参见 [GitHub 官方说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)。

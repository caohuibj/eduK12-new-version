# PR2：Bundle V3 生产流程

日期：2026-09-22。分支：`feat/bundle-v3-production`。基线：`8ad8071`（PR #160 已合并）。

## 范围与发布边界

本变更连接后台选择、固定实例、发布、课程/匿名作答、真实 FINAL、综合分析持久化、受众报告、JSON 导出、技术恢复和显式重分析。通用内容导入属于 PR3，本 PR 不引入导入器。

现有七个代码定义仍全部为 DRAFT。隔离数据库和浏览器验收使用显式测试 Bundle，保留 integrated 引擎的互补描述边界，并加入 SJT 与表单 Context。测试包不是 ADEXI 正式产品，也不代表其授权或科学审查已通过。生产目录没有被提升发布状态。原计划 B-01 中“至少一个真实包获准发布”仍是正式上线前的发布门槛，不能以测试夹具替代。

## 实施结构

| 入口 | 实现与约束 |
| --- | --- |
| 定义提供器 | exact key/version；统一装配代码目录；完整冻结 Bundle、Context、规则、报告标签和内容哈希；禁止 latest fallback |
| 后台 | `/bundle-products`；管理员/教师创建、发布、归档；精确版本授权；课程所有权与依赖测评权限；不可自由换槽位 |
| 学生 | 课程详情的综合测评入口；复用四类单项运行器；匿名入口复用恢复凭证 |
| FINAL | 按 productKind 分派；Bundle 使用冻结 V3 编译身份；父作答完成与 INITIAL/PENDING 同事务提交 |
| 分析 | 服务端复用 FINAL 的 canonical 来源验证器；不读 raw answers/trials；计算在提交事务外；短事务复核 epoch/输入哈希并写输出 |
| 报告 | 读取持久化 BundleReportFacts；GET 不运行分析引擎；单项结果沿用原报告；敏感 Context 始终遮蔽；量表披露使用准入时冻结策略 |
| 导出 | 获取同一授权分析记录的服务端受众投影并下载 JSON；禁止从通用明细导出旁路访问 Bundle |
| 恢复 | PENDING/FAILED 可显式重试；同一个 INITIAL 或 requestId 复用逻辑记录；最多五次处理尝试；关闭新建开关仍允许恢复 |
| 重分析 | 管理员/拥有该包的教师；精确目标、requestId、前序记录、原因；读取原冻结来源；追加历史；保留原 FINAL 和原报告 |
| 旧路径 | questionnaire collection-only、legacy report package、legacy protocol、relational 专用访问边界继续分派到既有实现 |

报告状态：PENDING 表示尚未落地输出；FAILED 表示技术故障；UNAVAILABLE 表示完成计算但证据/质量不足；READY 表示可读取结果。READY 不代表临床结论或量表授权。

## 存储取舍

使用关联表 `bundle_instances`、`bundle_analyses`。既有 CompositeAnalysisSnapshot 要求旧 analysis protocol 的必填字段，并以旧版本指纹约束唯一性，不能表达 V3 的待处理状态与独立 requestId 历史；因此没有把 V3 填入旧结构。

实例定义和绑定加密保存并有独立哈希。分析唯一约束为 `(attempt_id, attempt_epoch, request_key)`，初始键固定 INITIAL；显式重分析使用请求 UUID。终态输出通过条件更新提交，技术重试不会覆盖 READY/UNAVAILABLE。计算故障保留单项完成结果；若在计算前进程中断，事务已提交的 PENDING 记录提供恢复依据。

## 有意限制

- 仅 SELF 投放；observer 走独立产品，不开放本入口。
- 测评槽位必须必填；FORM 槽位只能引用声明的 Context 精确身份。
- 声明年龄上下限的包必须声明必填数值年龄，提交前校验格式和适用范围。
- 科学性、语言、材料授权仍由正式内容发布流程负责；定义出现在目录不等于获准投放。
- 不开启生产安全触发，不新增危机判断。报告标签属于有限结构，尚不是自由模板或通用导入 DSL。
- 既有单项资格策略仍执行；测试包的简化量表不能证明真实 ADEXI 所需上下文和授权已满足。

## 验收证据

- 定义提供器测试：精确身份、重复项、冻结篡改、历史读取。
- PostgreSQL 生命周期：四类真实 FINAL、并发创建/分析唯一性、重分析历史、缺 selector、权限撤回、匿名恢复凭证、未完成拦截、归档历史、失败恢复和开关关闭。
- PR1 四类问卷的 12 项 PostgreSQL 回归已通过。
- Chromium 真实浏览器闭环已通过：后台选择/发布、课程入口、四类 FINAL、教师/学生报告、JSON 导出同一 factsHash、追加重分析；零 pageerror。
- 本地浏览器证据：`/tmp/huisurvey-b2-browser/result.json`、`student-report.png`、`teacher-reanalysis.png`、`report.json`。其中含合成测试账号，不提交到版本库。
- 前后端 TypeScript 均已通过；前端 lint 无 error，保留仓库既有 warning。
- 后端首次启用全部数据库组的全量运行：360 个套件中 358 个通过；另两个因新测试库缺少既有 fake 认知种子失败，补齐种子后这两个套件的 16 项全部通过。
- 后续重复全量与前端并行运行出现既有用例超时和一次并发完成压力测试失败。已停止该次重复全量；集中串行复核 5 个异常套件，15 项全部通过，未修改断言或超时配置。200 份并发完成复核耗时约 2.7 秒。中断的一轮不计为全量绿色结果。
- 新增 Bundle 验收最终包括 12 项 provider 测试和 5 项真实 PostgreSQL 场景，全部通过；相关 reanalysis/legacy 报告定向回归通过。
- 前端 136 个套件、518 项中，初次并行运行仅 password-return 的 5 秒超时项失败；该项单独复跑通过（约 2.5 秒）。最终前端类型检查与生产构建通过。
- 最终构建的报告页面再次在 Chromium 验证：授权 JSON 导出同一 factsHash、通用明细导出返回 409、390px 手机宽度无横向溢出。额外证据为 `final-report.json` 和 `final-report-mobile.png`。
- CI YAML、浏览器脚本与发布验证脚本语法检查通过。

CI 复用现有 backend 和 browser job，增加本功能的验收与不允许跳过断言，不建立额外工作流。当前仅本地开发与验证，未推送或触发远端 CI。

## 本地提交

| Commit | 内容 |
| --- | --- |
| `a169a68` | exact provider 与完整冻结基础 |
| `30fd1fb` | SJT 冻结来源接入显式重分析 |
| `b30ba61` | 实例、FINAL、分析持久化、权限与恢复 |
| `4c4197b` | 后台选择/发布和受众报告界面 |
| `c394323` | 数据库/浏览器验收及现有 CI 接入 |
| 本文所在提交 | 报告质量文案、最终验收记录与恢复 runbook |

正式上线前仍需完成真实 Bundle 的独立发布审批，见“范围与发布边界”。本地技术验收不代替该审批。

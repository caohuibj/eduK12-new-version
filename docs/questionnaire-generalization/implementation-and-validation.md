# PR-Q1：四类问卷实施与验收

## 范围与基线

基线 main：f89354d32c7ac3dc4a9abd3a6abdca851667b8b5。分支：feat/questionnaire-four-type-collection。

管理员与所有者教师可从“聚合问卷”创建问卷，编排 SCALE、COGNITIVE、SITUATIONAL、FORM，投放到一个或多个有权限的课程，或者创建 GENERAL 公开问卷。各单项独立反馈，表单作为背景信息；不生成跨测评综合分析。本 PR 不实现后续 Bundle 生产体系或导入平台。

旧 Questionnaire 保持原 ID、子表、链接、结果及导出路径；旧记录可显式复制为新版草稿。新问卷使用明确标记的 Composite 容器和现有 FINAL_ONLY / UNIFIED_V1 运行时。

## 已实现的边界

- 创建/复制使用操作者范围内的 requestId 和内容 hash；重复请求返回原实例，内容不一致返回 409。
- 修改必须携带 revision；模板行锁、子项更新、课程关系和版本递增在同一事务内。
- 发布重新检查权限、依赖、人口学上下文与资产；已发布编排不能直接修改，修改通过复制草稿完成。
- Cognitive 在发布/复制时生成专属冻结绑定；学生开始时按服务端确认的有效课程生成合法课程绑定，精确保留 profile 和配置。匿名参与不取得课程访问权。
- 新作答在事务内重新检查发布状态与时间，避免停用与开始并发时使用旧状态。
- 数据库 CHECK 和服务层都禁止新问卷绑定 reportPackage / analysisProtocol；旧编辑 API 不能绕过 revision。
- 完成单元沿用既有 canonical FINAL；父级沿用授权状态读取后的协调机制。重复和并发读取仅完成一次。
- 报告复用单项投影，传入量表已冻结的披露策略；受限/未知策略不扩大展示权限。历史报告不因原资源停用而重新计算。
- 导出为分页的受众过滤 JSON，每页最多 100 个已完成 attempt；包含各单项身份和结果，不导出 raw responses，也不混并同名指标。
- Web 支持新版混合问卷；原小程序接口保持旧行为。编制页面明确告知新版使用网页。

## 本地验收结果

测试环境为本次专用 PostgreSQL 14 / Redis 7，使用合成账号和数据，没有访问生产数据库。

| 验收 | 结果 |
| --- | --- |
| 后端构建与 TypeScript | 通过；最后报告/生命周期修改后重新通过类型检查 |
| 问卷、Composite、统一聚合及量表披露回归 | 25 文件，216 用例通过，无跳过 |
| 新产品真实 PostgreSQL 生命周期 | 12 用例通过，包含在上行内 |
| 前端类型及生产构建 | 通过 |
| 前端问卷/Composite 组件 | 11 文件，40 用例通过 |
| 空库全部迁移 | 通过 |
| main 旧迁移 → 插入历史 Composite → 当前迁移 | 通过，历史记录仍为 LEGACY_COMPOSITE / null questionnaireType / revision 0 |
| 教师浏览器 | 双课程选择、四类编制、发布、学生发现、刷新恢复、四类实际作答及报告通过 |
| 管理员/匿名浏览器 | GENERAL 四类编制、公开 token、匿名实际作答、刷新恢复及报告通过 |
| 最终报告复验 | 最新后端与最终前端构建上，两个问卷的报告 API、JSON 导出和页面通过；量表正常显示单项结果 |
| 远程 CI | 按用户要求暂不启动；草稿 PR + HEAD 的跳过 CI 标记 |

浏览器认知任务使用真实计时和输入；合成操作被既有质量规则标记为不可稳定解释时，页面保留完成状态并隐藏不适合解释的指数。未为取得漂亮结果修改质量门槛。SJT 使用现有 golden fixture，缺少的冻结解释文案按既有规则明确提示，不动态补写。

## 验收矩阵对应

| 计划编号 | 可复现证据 |
| --- | --- |
| Q-01 | teacher 与 admin 两条浏览器流程；四类独立 FINAL 数据库用例 |
| Q-02 | 两课程学生分别获得对应课程的 Cognitive session assignment；非成员拒绝 |
| Q-03 | 匿名浏览器全流程；恢复凭据串用拒绝；过期 token 新作答拒绝 |
| Q-04 | 浏览器表单填写后刷新恢复；数据库同 attempt 恢复及新 epoch 重启、旧 FINAL 拒绝 |
| Q-05 | 重复量表 FINAL；最后两个独立 slot 并发提交、并发协调父级，进度 100%，两份 snapshot |
| Q-06 | 未发布资源阻止发布；原量表停用后学生/教师仍可读取冻结报告 |
| Q-07 | 三类单项报告及 Form 背景；零 CompositeAnalysisSnapshot；受众过滤测试与页面复验 |
| Q-08 | 原问卷及 Composite 回归；旧定义复制后原记录逐字段不变 |
| Q-09 | 已发布修改拒绝；管理员复制教师问卷后可独立发布 |
| Q-10 | Web-only 明示；没有更改原小程序发布/作答协议 |
| Q-11 | 严格请求 schema、数据库约束、报告包 setter、旧编辑 API 绕过检查 |
| Q-12 | 同量表两个 slot 分别完成、独立 itemId 与 snapshot，报告不串用 |

Q-08 的旧路径以真实数据库及既有回归为证据，没有宣称逐一手工重走所有历史浏览器链接。前端新编制器提供添加/移除和单元排序；本 PR 沿用既有 Form section/背景字段规则，不增加可选认知或可选情境判断语义。

## 复现命令

先安装 backend/frontend 依赖并生成 Prisma client。只允许对专用测试库执行迁移、生成浏览器数据。

backend 环境至少需要 DATABASE_URL、QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL（两者相同）、PR26_INTEGRATION_DATABASE_URL、PR34_INTEGRATION_DATABASE_URL、PR38_INTEGRATION_DATABASE_URL、PR8_INTEGRATION_DATABASE_URL、SITUATIONAL_BUNDLE_INTEGRATION_DATABASE_URL，以及仓库现有 JWT、加密、匿名凭据环境变量；全部指向专用测试服务。NODE_ENV=test，COGNITIVE_MODULE_ENABLED=true，BACKGROUND_WORKERS_ENABLED=false，REDIS_URL 指向专用 Redis。

在 server-version/backend：

    npm ci
    npm run db:generate
    npx prisma migrate deploy
    npm run build
    npx vitest run src/__tests__/questionnaire src/__tests__/composite src/__tests__/assessment-runtime/unified-aggregate.test.ts src/__tests__/scale/composite-scale-disclosure.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
    npx tsx ../e2e/questionnaire-products-fixture.ts

在 server-version/frontend：

    npm ci
    npm run typecheck
    npx vitest run src/components/questionnaire/__tests__ src/modules/composite/__tests__
    npm run build

启动 backend 和 frontend 预览（浏览器默认 http://127.0.0.1:5141；同源 /api 代理到 backend）。在 server-version：

    QUESTIONNAIRE_PRODUCT_ISOLATED_DB=1 node e2e/questionnaire-products-browser-e2e.cjs
    QUESTIONNAIRE_PRODUCT_ISOLATED_DB=1 QUESTIONNAIRE_PRODUCT_PUBLIC=1 QUESTIONNAIRE_PRODUCT_EVIDENCE=/tmp/huisurvey-q1-browser-public node e2e/questionnaire-products-browser-e2e.cjs

可设置 BROWSER_EXECUTABLE、QUESTIONNAIRE_PRODUCT_BASE_URL、QUESTIONNAIRE_PRODUCT_FIXTURE_FILE 和 QUESTIONNAIRE_PRODUCT_EVIDENCE。默认使用本机 Chrome；Linux 执行时指定 Chromium 路径。fixture 文件含专用合成账号登录信息，不提交该文件。

两条完整流程完成后，在原 evidence 目录使用 QUESTIONNAIRE_PRODUCT_REPORT_ONLY=1 复验报告。该模式使用既有 result.json，只读取报告和导出，不新建作答。

## 发布与回退

1. 正式发布前启用并通过仓库完整 CI；本次暂不触发。
2. 先执行增量数据库迁移，再发布后端与前端。迁移没有删除或重写旧 Questionnaire 数据。
3. 先以内部课程验证；新版问卷创建开关 QUESTIONNAIRE_PRODUCTS_ENABLED=false 可关闭 create/copy，保留现存记录读取、作答和结果。
4. 如需停止单份问卷新增作答，使用“停止新作答”；已有凭据下的历史读取及完成链路保留。
5. 应用回退不逆向删除新表、新列或历史报告。旧二进制不认识新产品时应保持新入口关闭；不要回滚成允许旧编辑器修改新容器的部署组合。
6. 开启 CI 需用户后续授权；届时推送不含跳过标记的新提交并转为 ready，或按仓库约定手动触发。当前跳过检查不代表合并门禁通过。

GitHub 跳过机制依据：[Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)。当前工作流的自动创建事件为 pull_request；没有 pull_request_target。pull_request_review 仍可能触发工作流，本次不提交 review。

## 保存的页面证据

- [教师编制页面](evidence/teacher-editor.png)
- [移动端编制页面](evidence/teacher-mobile.png)
- [课程问卷最终独立报告](evidence/course-report.png)
- [匿名问卷最终独立报告](evidence/public-report.png)

测试运行摘要保存在 evidence/validation.txt。截图与结果全部来自本次隔离合成数据。

# 上线前 Legacy 清理：单个 PR 的范围与恢复后清单

基线：main@16a246a2（PR #220）。本 PR 只包含上线前不依赖真实历史数据恢复即可验证的清理与边界修复。原专项 Review 中的两个 PR 计划在此合并；后续数据退休不包含在本 PR。

## 本 PR 已处理

| 范围 | 结果 |
| --- | --- |
| 无引用前端源码 | 删除 App.css、DocumentViewer、Layout/StudentLayout alias、VideoUrlUploader、旧 Login、staff SectionNav/auth-ui/staffLabels、types/shared、scaleLabels、persistence barrel；底层 checkpoint stores 保留 |
| TeacherCourseDetail | 删除未调用/未渲染的 Scale 类型、状态和 fetch |
| Organization tasks | 删除仅测试使用的 Page；测试实际生产 router；站内 CTA 改 /my-assessments；旧 URL 与 returnTo 兼容保留 |
| 无引用后端源码 | 删除 scaleLabels、assessment-runtime/constants、registry-definitions barrel、旧 Questionnaire-only tokenBackfillService；四类 token migration 脚本保留 |
| 空 relational 产品 | 以当前身份的 published catalog 或可访问 legacy task 显示导航；ParentHome 同步；失败有重试，不当作空；Run inbox 和直接历史 URL 保留 |
| 小程序 | 标明 unsupported / 非生产依赖；门户家长文案不再承诺空观察产品；保留源码供追溯 |
| fake fixture | seed 为 DRAFT、recommendedForCreate=false；生产 catalog、配置/资源选择、新 assignment、config publish、wrapper/copy、session 新开始拒绝；仅 NODE_ENV=test 且显式 fixture flag 才允许测试；不修改生产已有行 |
| 旧问卷不可变 | COURSE/GENERAL 的定义修改和 publish 共用父行锁/事务；子写入、媒体 retention 和嵌套事务参加同一事务；错误 JSON 触发回滚，成功在 commit 后发出；非 DRAFT 拒绝定义写入 |
| 新旧问卷边界 | 旧页面标为历史；旧 COURSE 列表的新建 CTA 指新版；普通非必填字段 copy 给明确错误，不静默改必填；保留显式历史 GENERAL 编制以覆盖能力缺口 |
| 改密重复 | 一份 service、一份 handler；auth 与 users URL 共用；当前 Web 调用 canonical auth URL；共享 limiter/admission、首次改密 allowlist 保留 |
| 部署资料 | DEPLOYMENT-CHECKLIST 为唯一全站入口；修 stop worker、同 SHA/镜像、PG major restore、资产/四类 token 门禁、smoke 与 rollback；过时正文归档并标 DO NOT USE |
| 旧脚本/命令 | host 部署脚本保留简短 exit 1 入口，正文归档为 .sh.txt；移除失效 npm deploy；旧 Bearer 视频测试归档 |
| 回归门禁 | 新生命周期并发测试加入 CI 与本地 release-report 不可跳过清单；Cognitive 并发改用独立 PUBLISHED test fixture，不再依赖生产 fake seed |

数据库 schema、migration、历史数据和生产配置值没有变更。没有执行部署或生产数据操作。

## 保留至上线后数据恢复完成

- frozen report reader、immutable snapshot、历史 hash、scorer/protocol/presentation adapter、旧 attempt reader。
- 旧 Questionnaire/GENERAL 的 start/resume、FINAL、必要 restart、report/export、token revoke/deprecate、有效定义 copy。定义只允许 DRAFT 修改；读与交付未整体关闭。
- 显式历史编制入口：新版 ordinary optional、部分编排和 CSV 导出语义尚未完全覆盖，恢复前不宣称无损整体替代。
- /organization-tasks、改密旧 URL、register 和 31 条旧增量写入的 410 tombstone。禁写端点已共用 handler，不改变既有 guard/feature/顺序；URL 退休需要客户端和旧链接证据。
- Asset migration reader、旧附件解析、filesystem/COS 转换路径与 migration scripts；当前生产启动要求仍保持。
- imageQueue consumer/status/env/metrics：先核实历史 Redis jobs 和资产引用；本 PR 不删。
- 当前有真实用途的 legacy UserRole、material grants、Organization/Run 领域隔离；不做权限模型替换。
- Cognitive deprecated audit aliases、治理/安全队列骨架、测试或动态加载入口；不可凭无 import 删除。
- 所有 retention-critical Prisma lifecycle/authority/runtimeGeneration 字段与 enums。

## 恢复后退休条件

1. 记录各旧模型/状态、进行中 attempts、公开链接、旧客户端请求与 legacy relational tasks 的真实数量。
2. 验证 completed report 与 frozen 媒体/hash/scorer 仍可读；不得用最新定义重算旧结果。
3. 盘点生产 fake assignments/embedded references/in-flight sessions，再决定退休在途任务；已有 completed 读取与合法 resume 不物理删除。
4. 完成 local/remote 资产 provider 转换，验证 hash/reference/scope、remote skipped 清单与旧附件；四类 token remaining=0，约束 validated。
5. 盘点并处理 Redis image jobs；只有清空旧任务且无旧 URL 引用后才删 consumer/status/env。
6. 解决或明确保留新版 GENERAL 能力缺口，再停止剩余历史编制；迁移使用新身份，不覆盖旧答案、credential、snapshots 或 results。
7. 取得 URL/410 alias 访问遥测和测试 fixture 迁移证据，再退休 compatibility routes、unbound adapters 和 audit aliases。

## 验证记录

本 PR 使用 Node 24.21.0。真实 PostgreSQL 16.15 与 Redis 位于本任务的独立临时实例；SJT 测试端口可显式配置以避免占用已有服务，同时保留专用身份、loopback 和数据库限制。

最终构建、测试数量与执行限制在 PR 描述中记录。Compose config、manifest/dependency guards 和已有 preflight 工具契约需要通过；生产数据恢复、Docker 镜像构建/staging smoke 是发布操作门禁，不由本 PR 伪造完成。


实际验证结果：

- Backend CI regression：459 个文件通过，2,734 项通过；Docker 容器启停故障恢复的 1 项测试未运行。按现有 CI 口径不包含独立 aggregate-report performance 套件。
- Frontend：693 项通过；类型检查、生产构建通过；lint 0 errors / 110 warnings。
- 新增真实 PostgreSQL 生命周期/并发/回滚/复制测试 8 项通过；关键 integration suites 未跳过门禁通过。
- Backend 完整 build、Cognitive manifests/dependency guard、前端 product route inventory 和 Cookie/CSRF browser helper 契约通过。
- Compose config、12 项现有资源/负载/session 工具契约、8 个停用脚本的语法/exit 1、归档链接及 diff whitespace 检查通过。
- 本机 Docker daemon 不可用，未构建或启动 Docker 镜像、未执行 staging 或生产 smoke；这些仍由发布门禁确认。
- CI 首轮发现匿名 START 浏览器测试依赖生产 fake seed 的 PUBLISHED 状态；现改为创建并清理独立测试配置，browser job 显式 opt-in，仅 test 环境允许。修复后本地实际浏览器的 8 个匿名 START/storage 场景、relational 四角色验收及 8 项生产 fixture 限制测试通过。

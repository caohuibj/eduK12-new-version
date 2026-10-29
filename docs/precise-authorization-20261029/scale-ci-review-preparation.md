# 量表候选的独立复核准备；尚未激活 CI

当前产品/证据检查点为 `ca7cef4b0dbaf943eb61d925b4883bf6de2dfbdc`，
base main `dc0f46ba506d51d42c5bb379059df82f18860b72`。
[完整来源索引](scale-review-source-ca7.json)给出 221 个实际 raw-diff 路径、模式、原/新 blob、
完整 tree、组件 tree、锁/schema/规则等关键输入和 binary-patch SHA256。
后续新增的本准备文档、产物证据和冷加载脚本不在这个历史检查点内；
任何正式激活必须重新冻结最终完整 HEAD/raw diff，不能把本索引当最终执行绑定。

## 路由障碍已经实测

仅在本地调用当前未修改的分类 CLI，模拟准确 same-repository Draft 元数据：退出 0，
实际输出 `application_route=legacy`、`scenario=platform`、`validationClosure=all-bundles`，
还选择 media2/video_core/media7/situational_video/situational_branching、performance。
原命令与完整输出在 [观察记录](scale-ci-route-observation.json)。没有创建 PR 或触发 Actions。

现有 `school-teacher/native-bundle` 是 PR388 的精确来源路线，不接纳本任务；
不能改标 candidate 名、拓宽任意目录或使用原 Bundle 证据去覆盖精确授权/迁移。
普通 Draft 也会重复整包/内容等检查；Ready 更不应直接回落全平台。

依据 [AGENTS.md](../../AGENTS.md) 的“先准备可审阅的精确 base/head/tree、完整差异、
消费者/fixture/schema/锁定依赖/环境开关、证据复用边界、所选 route/jobs、未执行项和预计预算”，
激活前需要独立复核。Notion [CI 常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)
已读取；返回页面修改时间为 2026-10-29 20:48:25 UTC、verification=unverified。
它不是最新 main 是否合格的权威来源；main 以实际 Git SHA 核实。
本次没有正式 CI 失败，不能把本地探测/fixture 原失败记为 CI 轮次。

## 拟接入范围与证据处理

优先扩展既有 exact qualification family 的一个明确 Task1 候选适配，
复用原 admission/生产构建/审计/安全扫描/CodeQL/stable gate，不另建一套 CI 系统。
适配尚未实施、尚未审查；以下是需形成执行合同的工作分工，不是已经存在的 job 名或成功证明。

| 阶段 | 真实目标和初始预算 | 已有/缺失边界 |
| --- | --- | --- |
| 来源 admission | 完整最终 base/source/merge tree、模式/blob、schema/locks/flags、案例映射；约 1–2 分钟 | 本地 raw 是原件清单，未获自动可信签名；需逐案例审查，不自动接纳或重跑全部旧矩阵 |
| 后端构建/消费 | 当前变更闭包已实际 CommonJS 编译/冷加载；正式完整 release 必需输入仍需明确；约 2–4 分钟 | 局部产物不是完整 release；相同已合格内容/seed 不再次检查 |
| 前端产物 | 当前 tree 已单次 production 编译＋8 个页面 PASS | 仅本地 unsigned 原件；禁止换 SHA 改标或默认重建，先确定现有接纳机制能否接收 |
| 权限与冻结 | 四入口旧/新、issuer/recipient、真实委托、自授、替换、T1/T2/T3、撤权/历史的逐 case 独立判断 | 原 fail/filter/续验保留；当前 1 个 Training 写路径有真实受限角色，其他路径原证据仍为 owner fixture |
| 缺失旅程与性能 | 正常连接的浏览器写入/MFA；多规模与批量、写/发布/START 的实际预算 | 尚未执行，不用静态夹具/小目录 p95 代替；先定小范围主要执行位置 |
| audit/runtime/SAST | 锁未变仍保留必需真实依赖审计；受影响运行产物扫描、security-extended 和原发现处理 | 不设 skip-success；CodeQL 保留原查询与每语言 30 分钟上限，不承诺五分钟完成 |
| 汇总/合并观察 | 每个实际 selected gate 必须 success，普通保护合并后只观察精确同产物 | 不改保护、不 APPROVE、不强推、不部署；目前全为 NOTRUN |

适用旧条目：CI-001（独立 opt-in）、003（跨包类型/Prisma）、006（真实角色/精确 trial）、
008/009/013（UI、实际恢复协议、旧响应代际）、014（SAST 预算）、018/019/020（范围/身份/证据边界）。
不能因列出 ID 就宣称各项通过；各阶段现状以对应 raw/verification 和缺项判断。

素材特定审批边界保持：DOT 的被拒混合工程 tree 未复制；fun R 的独立注册没有执行。
认知 profile 四入口尚未开始，不能把 PR388 的 Bundle profile 或本地 DRAFT 配置装载记作本任务完成。

# Task1 精确候选 CI 接线（保持未激活）

## 2026-10-30 双非空 R 增量，待自然节点独立复核

新 base `40799e96f34d12047f31507ca2eba87e31fc08d3`，新产品
`dd7715ede027287df109e9ae801698a3c49a6d69`。同 C/P 标准/趣味 R 已经正常登记，
三工具六 R setup/幂等，实际两个匿名 FINAL 同分不同文本及冻结完成，详见
[双 R 原件](registered-dual-report-raw.json)和[范围说明](registered-dual-report-progress.md)。
旧 BLOCKED 是下文历史时点；当前 openAcceptanceItems 为空，以真实原件取代。
新应用增量是开发者提交、待 DOT 独立审阅，不将旧 root review 冒称覆盖新增材料。

继续 enabled=false，仍没有激活 Actions、正式构建/CodeQL/merge gate 或合并资格。
完整356产品路径绑定新 base before/after blob，两个最终 component tree 锁定产品；
控制 checkpoint 与最终 marker 分开冻结。没有再核235文件或重跑旧应用/认知链。
最终 head/控制 checkpoint 在交接记录给出，不预写未知成功。

现准备接纳26原报告/投影、67个互不重复通过 case，新增包括两个真实 R 的实际登记与
只读报告续验；5份类型仍明确为分阶段/受影响闭包，非整个最终 component 的新编译。
保留一个 exit1 原报告中的独立通过登记 case，同时要求其失败报告 case 有实际成功
续验；原首次失败不转成整条命令成功。既有 verifyFailureContinuations 复用，无新框架。
UI 原件19行中两条过滤用例同名；只有该明确格式允许重复 filtered 标题，完整原行、
顺序/状态/数量保持。执行过的 passed/failed 标题仍拒绝重复，其他候选维持原严格默认。

只新增/替换受影响的3个控制 case：真实证据接纳、双 R 事实负例、过滤标题正反边界。
本地首轮证据读取因为上述原过滤重复失败；当时负例被前置失败遮蔽、明确不接纳。
修正后3 PASS。旧9个选中控制中仅替换了受影响的原证据接纳 case，形成11个不重复
通过并集。原 actionlint输入未变直接保留，当前变化 JS只补 node --check；最终实际Git
绑定只检查冻结后的元数据，不启动应用生产者。最初非TAP原首错也完整保留。

已读仓库指定 Notion CI 常见错误清单（page lastEdited 2026-10-29T20:48:25.178Z）。
当前仅CI-001/003/006/009/013/019/020适用：独立 opt-in、原schema/锁和实际生成client、
真实正常批准/grant/FINAL/报告、scope严格停止、unsigned证据和旧失败边界均如上标注。
CI-002工作流语义输入未变复用原actionlint。没有新增路由不跑生成器，也不因旧条目
开展全矩阵。正式 CI 未执行，因此没有新正式CI失败或失败回写声称。

拟仍仅scope → onboarding-structure（接受已审阅原件，缺失backend tsc/frontend Vite
各一次）→ CodeQL → merge gate。独立Situational publication的 relevant 路径不含本次
scale文件/控制，现只读判定无关，不为其全目录重检；未改它的工作流。新R独立审核与
精确候选自然节点复核后再激活。最后正式候选不使用skip标记，不部署、不APPROVE。

---

以下为上一个控制候选的历史记录。

固定 main base `13884d7386987068f14b77ec5bbbcb8d431681d8`；产品来源
`e71d5f71f7223fefdce3e4f36ee0f6e619acf361`，包括已认可三项管理修复。
本阶段没有修改任何应用、依赖或迁移字节。最终控制 checkpoint/head、实际 Git 绑定
检查及远端回读在交接记录中提供，本文件不预写尚未发生的成功。

## 接线与合并计划

复用现有 `onboarding-structure`，没有新工作流/CI 系统。该分支用固定候选名 `task1`
定位；真实 PR 仍须为本仓库、准确分支和正整数编号，不预测或伪造未来 PR number。
marker 绑定完整 345 个产品差异的 before/after Git blob、路径和模式，以及前后端完整
component tree。控制另固定在不可变 checkpoint；未知路径、删除、模式、base、source/
merge tree 或控制漂移失败关闭，不回落 platform/legacy。没有重做 235 个源文件 SHA256
验收；这是正式路由所需 Git 对象身份约束。

`.candidates.task1.enabled=false` 是当前真实状态。当前控制准备提交可用仓库/GitHub
支持的 `[skip ci]` 抑制触发；没有创建 PR。它不是合格或跳过检查的成功。自然节点独立
复核后，如获准激活，需普通新提交明确开启该精确候选，最后提交不得带 skip 标记；先
读取仓库要求的 Notion CI 常见错误清单，再使用实际 PR number。未完成或失配证据停止，
不静默重跑应用或将范围扩大为全量。双 R 未解决前不得把任务宣称完成/合并合格。

激活后仅沿用以下作业，均仍需真实成功：

| 现有作业 | 本候选内容 | 预算/边界 |
| --- | --- | --- |
| scope | 固定完整输入分类，选择 onboarding-structure | 原 8 分钟上限；不安装应用依赖或运行应用 |
| onboarding-structure | 接纳有限已审阅原件、原控制结果；仅补缺失编译 | 12 分钟上限，约 5 分钟报告实际等待；每组件一次 |
| codeql | 当前变化应用及三个变化 JS 控制文件的 security-extended 分析 | 沿用原上限；不重复无关历史控制扫描 |
| merge gate | 重算实际 checkout，要求以上全部真实 success | Draft、missing、skipped、failed、cancelled 不合格 |

应用接纳：20 份明确选取的原件/保留 reporter projection，57 个全名不重复的通过 case。
完整原记录中的失败/过滤保留，不纳入新通过数；仅摘要没有 case 明细的输出不计入。
四个教育原生会话的 136 次试次作为单列真实只读回读事实核验，不虚增测试数。
既有类型只按实际“管理闭包/前端先前 app/最后恢复分支”范围标注，绝不伪称完整最终
component 编译。所有原执行是未签名本地证据，不是 Actions 实跑或通用信任机制。

确实缺失的正式产物：直接运行一次后端 tsc 和一次当前前端 Vite 编译，避开 npm build
附带的无关测试。backend/frontend 依赖各准备一次，使用官方源及原锁文件；只生成现有
Prisma client，不起数据库、不跑 setup/seed/迁移/作答。保存原命令、0/非0退出、日志、
source/tree/run/attempt；后端 dist 压缩包和前端同次产物/全部文件摘要保留，供真实后续
消费者复用。部分失败保留已成功产物，不能默认整作业重跑。未生成生产镜像或部署资格。

没有选择媒体、全用户矩阵、性能/规模、全平台回归、重复计分、Training/Survey 旧链、
136 次试次、#395 加载用例或另一套认知适配。控制原件读取不执行任何这些生产者。

## 本地最小控制证据

`ci-control-raw.json` 保留全部原命令/时间/退出/TAP，包括第一轮 3 个失败控制 case。
Git 替身漏基线控制 blob，修正后只续验四个依赖该替身的 case；一个起初因前置失败而
错误通过的负例明确作废，补正例基线后重验。两个独立证据/pointer case 没有重复。
另两个直接相关旧范围/稳定 gate 边界通过；新控制回执判定只补自身所需用例，前次
成功原件保留，新增非空/必需字段输入后仅验本项。正式 actionlint 1.7.12 的官方发布包
经官方 checksum 核验；只对当前工作流作语义 lint，不扩展 shellcheck/pyflakes。
9 个可接纳控制 case 形成不重复并集，未把过滤/作废/失败记为成功。最终真实 Git 绑定
检查在冻结 checkpoint/marker 后另提供结果，不重复这些控制 case。

本地结果仍待自然节点独立复核；没有 Actions run、PR、GitHub APPROVE、保护变化、
生产、真实用户授权或部署。

## 保留阻碍与观察

同 C/P 第二个非空 R 的附加素材正常登记工程仍 **BLOCKED**，特定旧拒绝未解除，
没有复制或换路执行。当前 admission 明确保留这项 open acceptance，不宣称全任务完成。
目录容量观察：`standard-combination-use.ts` 超过 100 个候选且 overflow 时会使前 100 个
PRECISE 项均不可选。尚无本轮真实故障，留作后续按工具/分页处理，不新增本轮改造或压测。

## 最终 main 目录增量对齐

Draft PR #401 创建后只读发现 main 前移至 `5a39fd7bf29a3c0ae8ec7c26d0631548a11ccbbb`（PR398）。正常合并产品 checkpoint `d38e1e74897cb56120b69fed0d9f170e5de3b3d8`；增量仅3个非可执行 COPSOQ 目录 source/index 与文档，未改接口、计分器、报告消费者、schema、锁或控制。后端tree因正常目录新增而变化，前端tree相同。上述双R原执行保持原main407输入/身份，不改标成新执行。目录项没有 executable，不参与本次CFQ/3材料注册；不重跑seed、FINAL、类型或旧链。候选完整source/component/control改绑后，仅补一次实际Git元数据检查，仍disabled。此前1000dc95审阅包保持其不可变身份，其应用原件/控制逻辑不变；最终base/head另给出。

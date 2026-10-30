# Task1 精确候选 CI 接线（保持未激活）

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

# B0｜26 个量表的 main 集成与最小合并验收（2026-10-28）

## 固定来源

- 目标 base：`main@b7909cbf05d5ba0092c59853f20c86491ab38137`（从当前 main 直接新建提交，不合并历史内容分支）。
- A 已验收源码：`integration/scale-26-candidate-20261028@5c680be4d121ecc3bf042a5b05da62cdd72866b0`，tree `1249cc92858035166d01cf485500fd7fe334d3c8`。
- 来源 PR：#362、#367、#370、#371、#373、#375；该 PR 不关闭这些原始 PR，也不自动合并它们。
- 26 个**新工具**对应新源版本及必要历史版本；A 生成注册表共 98 个 source import，其中 main 原有 57 个已逐一包含，新增 41 个不同 instrument/version 源码路径。具体26个当前可执行版本与 C/P/R 轴见本 PR 附带的 `docs/scale-26-readiness-20261028/README.md`。
- 数据库、Prisma schema、锁定依赖、公共运行时许可/研究门禁、账号与部署配置均未修改；source 里原来的版权标记、科研与审校状态保留，不被改造成安装门禁。

## 目标差异与兼容处理

- 仅选取 A 中 main 没有的 Scale instrument 版本文件、其研究原文/测试夹具和审核记录；保留原始 Git blob 和 frozen 题文、计分、报告版本，不再生成新科学内容。
- `scale/onboarding/instruments.generated.ts` 采用与原生成脚本 byte-for-byte 一致的 A 登记产物，不能手改或删除历史源。
- 保留固定 SPANE-B = SPANE-P − SPANE-N 计分器和 `scale-onboarding-boundaries.json` 的 SHA-256 不可变标记；不改变普通声明型 instrument 的 AST 安全约束。
- `catalog-tag-labels.json` 增补 15 个已定义的中文检索标签，无授权旁路。
- 共享 Scale 报告卡复用 A 通过测试的量尺说明、原分数位置、答题数量及可折叠技术解释，同时把新 main 的 `scale-unit-report` 容器样式保留下来；保留 main 已修改的 `report-ui.css` 不覆盖。
- `docs/scale-instruments/research-drafts/` 仅加入该26个工具相应的新增版本证据、研究fixture，确保既有 BPS/IPIP 测试能追溯原始输入；所有留档不代表被试数据或专家授权。

## 改动 → 必需检查 → 唯一主要执行位置 → 复用证据 → 预算/阈值

| 改动 | 可发现故障/必需检查 | 执行位置 | 正式可核验证据 | 时间约束 |
| --- | --- | --- | --- | --- |
| 41个新增版本源码 + registry | 重名、漏注册、内容AST、报告/计分绑定、golden执行错误 | GitHub 当前PR选中门禁 | A run 40649826151(index), 40650390899(26/156)，仅输入可正式接纳时复用 | 轻量作业约5分钟时定位阻塞，不追加无关检查 |
| 新的 SPANE scorer + immutable SHA-256 清单 | SPANE-B函数导入、越权内容执行、scorer版本变动 | GitHub 当前PR选中平台/Scale门禁 | A run 40650390899内容边界及SPANE九样例成功 | 不将新 scorer 冒充纯 JSON 内容 |
| 4个后端受影响测试 + 研究fixture | 未带原始输入、DBT默认字段误判 | GitHub 当前PR选中测试 | A runs 40650390899+40650815438，最终22个选中后端测试结果成功 | 失败只重验相关用例 |
| 共享前端报告组件/CSS + 7个直接消费者用例 | A组件覆盖main新修复、分数0/缺失误显、details交互、未授权披露 | GitHub 当前PR选中类型/交互 | A run 40650815438 前端tsc与7/7 UI；新main一行样式已复用 | 只关注真实受影响消费者 |
| 研究留档与标签 | 26项身份、C/P/R、授权标签错配 | 代码审查与明确的source检查 | Notion <https://app.notion.com/p/407d27635a388167ac70e445169d1107> | 不增加科学审校或作者联系门禁 |

新计分器和边界清单位于既有 content-only 路由白名单之外，故 PR 必须接受 main 工作流的实际平台分类及 required gate；不能仅凭 A 的自定义定向工作流宣称合并资格。正式重复测试的取舍以 CI 当前可证明的接纳能力为准，不能凭旧运行号伪造已接纳。

## 完成边界

此 B0 只负责集成候选PR和适用的正式门禁，不主动合并、部署或写入任何数据库。26项数据库 installed/published/distributed 真实状态仍为 NOT_QUERIED。源代码本身的 PUBLISHED 只是作者封装的可执行 releaseStatus，不等于平台公共库正式发布。

B1/B2/B3 另以正式 production source SHA、真实 SYSTEM_ADMIN、按工具精确 locale/localizationVersion、deployment revision、proofHash、visibility、allowedProducts 与组织使用授权执行；绝不猜测生产身份或默认向全部 K12 用户分配。

# 最小修正与接入顺序

起点：内容分支cognitive-next-three-core-20261026，86adea091270134b5197fb81b76649007596b8f3。2026-10-26只读远端核验main仍ff8471e529e7b3c56e1e20f17d1e2581040fc896；PR356为Open/Draft，head58c43e22c2fa6f120320594e17a940dd2a24ae7a，未合并。不合入该PR、不替换其共享文件。

| 顺序 | 修改→真实故障 | 执行位置/负责人 | 必要检查与复用/预算 |
| --- | --- | --- | --- |
| 1 | 点数候选取消无条件invalid投影，正常完成给数量报告事实；同步真实计分/质量/报告版本 | 原点数agent，候选专属backend/frontend及生成器 | 仅受影响scorer/gate/投影/版本/报告；空答中断非法仍拒，旧seed/capture/25trial时序不重跑；数分钟，实际原件另存 |
| 2 | 再认及ANT候选检查原生投影，去除单纯无常模/物理时序证明的封闭，保留缺答和质量限制 | 原两个agent并行，独立候选目录 | native不信客户端review；分母/null/负值/三态/冻结不兼容；不重跑完整任务采集；数分钟，素材授权不捏造 |
| 3 | MOT练习中断不能当0/5完整表现并进入正式；异步保存与宿主切换需精确隔离 | 内容主线；先定最小版本影响，再小步修复 | 只检查中断练习、真实全错、原记录重试及受影响context，保留旧持久化证据；不做轨迹或帧分析 |
| 4 | 原生注册及双profile发布 | 平台线；需统筹确认共享范围后实施 | `v2/registry.ts`仍从legacy registry派生、`v2/publication-gate.ts:43`仍强制standard（均已读取58c43e22远端），不填假score或造第三profile。需增加精确native定义解析与允许实际发布profile的契约；旧任务兼容、未知tuple拒绝、两版冻结须定向验证 |
| 5 | 可靠保存和完整原件COS引用 | 平台存储/API线，与统筹协调 | 当前`CognitiveRawSubmission.payloadEncrypted`为DB内完整试次包，尚无本候选COS原件回执字段；`unified-raw-submission.ts`只支持schemaVersion/attemptEpoch/trials/provenance。不能塞新字段称已归档；先冻结最小API契约与真实身份映射，再由平台确定沿用的归档/持久任务设施和必要schema变更 |
| 6 | 原生runner与报告/导出/标签消费者 | 平台入口线＋内容适配 | 四入口共享组件、真实epoch/归属/幂等、一次权威计分和冻结报告、授权导出同一原件。Survey原固定Go/NoGo不能被通用runner存在替代；逐入口证据未有则保留未接通 |

## 向统筹提交的共享范围协调请求

内容侧将提供真实TaskDefinition、research/experience config、纯scorer、受限报告投影、core/raw包和标签，不新增共享字段。平台需先确认：原生定义解析入口及profile校验修改由谁实施；COS完整包上传/核对/持久归档状态复用哪一现有设施；sessionId、attemptNo与真实attemptEpoch的权威映射。此文是请求和最小依赖，不是已获平台接口实施许可。

完成契约建议：同一submission/epoch/hash幂等；真实scope/participant/配置绑定；完整包含冻结核心、版本、现有raw与设备事实，服务器不需COS回算；ACK不得伪造持久化。报告不等待额外科研分析；COS故障有可重试的真实归档状态且不丢原件。先核现有设施再决定同步上传或已有耐久队列，不在内容分支另造存储架构或数据库迁移。

本轮只针对新增/受影响输入检查，云端为主要执行位置；已有未变seed/轨迹/capture/scorer算术和失败原件复用且保持原身份。无全量CI、浏览器时序重测、合并或部署。交付状态逐项标已开发/已提交/已注册/已导入/可施测/已上线；当前只称内容候选，API/DB/COS未闭环。

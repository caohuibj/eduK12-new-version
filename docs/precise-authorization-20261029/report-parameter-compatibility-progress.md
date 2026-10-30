# 新组合的报告分档机械兼容性

基线 `1e7326c1584a2354f02db0bb93b8b21dd96b8997`，main 仍为
`e65d87222d351e5dfde52e389f3aa403380443eb`。

原 `composeTriplet` 逐条要求 P 的所有 threshold key 都出现在 R 中，方向与本任务
契约相反：额外 P 分档不应强迫简短报告采用；R 真正需要而 P 没有的 key 才应阻止
保存。新增纯机械检查只在新组合预览/审批的原 assembly 路径消费，按 R 指定的
score、referenceVersion/kind 及实际原生分档提供者核对。P 的治理分档优先于阈值，
没有治理分档时仅 criterion_threshold 的 thresholds 能提供 criterionBand。

显式无 R、没有分档需求的 score-only R，以及只引用 P 部分已有分档的 R 均可通过。
R 引用不存在的分档、没有选择的参数版本、没有任何可供分档的 P，明确列出
`报告所需分档缺少选定参数支持：<score>/<band>`。既有指标、计分版本、参数结构/
来源、审批范围和 reference selection 校验仍保留；没有新增专业适配裁决。

最终 5 条定向单测及 Node 24.21.0 后端闭包类型检查通过。单测既包含明确仅用于
软件测试、不入库的合成 criterion fixture，也包含已有数学学业自我效能的真实
registry C/P 与治理分档接线：新增未知 R key 被拒绝，输入及 C/P hash 不变。
没有为 CFQ-7、IPIP C1、BPS9 添加阈值/常模或改写其材料，也没有重跑其原内容报告对照。

首次类型命令的窄闭包缺少现有 Express Request.user 全局扩展，报缺少 user；只在
本地检查配置 include 加上原 middleware/auth.ts，原业务代码/5 条通过断言未变，
仅类型检查复验退出 0。原失败保留于[原始证据](report-parameter-compatibility-raw.json)，
最终文件/hash/边界见 [verification](report-parameter-compatibility-verification.json)。

不修改历史 template compiler/renderer、旧快照读取、评分或已批准内容。没有 DB
写入、全平台验证、正式 CI、PR、合并或生产动作。该机械修正不等于新增任意组合
的入口批准权，也不表示四入口完整验收完成。

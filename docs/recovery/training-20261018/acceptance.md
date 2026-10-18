# 重建验收合同与状态

合同来自 2026-10-18 用户确认。状态只据新版本原始证据更新。初始 C01 为静态盘点；C02 准备中；其余均待实现/验证，不承认旧丢失成果已恢复。

## 共同不变量

四入口与母版共用定义、协议、评分、报告、导出内核；入口只处理身份、关系及能力。Training 保留匿名、多波次、课程、学员—培训者长期关系、作业和打卡。旧课程、发布定义、已接受 FINAL、历史分数/hash 不回填不重算。新增策略默认关闭，只影响显式配置的新发布。保留授权、冻结版本、幂等、必要事务锁。专业模板许可不授予被试数据权限，分发许可不等于改编许可。

## 26 个验收单元

| 单元 | 必须满足的行为和证据 | 初始状态 |
| --- | --- | --- |
| C01 基线/合同 | main/commit/tree、refs/对象、实际源码证据与恢复范围；不误用旧通过记录，保留用户改动。 | 静态盘点完成 |
| C02 隔离环境/fixture | 独立依赖和 fresh Prisma；真实 PG/Redis 迁移，运行生产 dist；合成角色与素材；健康及最小发布→作答→报告→导出；源码/产物/配置绑定。 | 准备中 |
| C03 typed Form | typed FINAL 为事实源；旧文本仅兼容投影；编制/发布/恢复/报告/导出共用公共 Form 内核；不修改历史事实。 | 待执行 |
| C04 基础高级题型 | NUMBER/LONG_TEXT/DATE/TIME 的合法边界、无效输入、旧题兼容、真实全链。 | 待执行 |
| C05 结构化题型 | LIKERT/MATRIX/MATRIX_MULTIPLE/RANK_ORDER/SLIDER/CONSTANT_SUM 使用共享 schema/验证/控件；结构不损失。 | 待执行 |
| C06 Form V3 | 连续表单段只引用前置选择题；隐藏答案前端清理、服务端拒注入；ANSWERED/REFUSED/SHOWN_MISSING/NOT_SHOWN 区分；other/exclusive/text；稳定键复制/导入/分卷重映射。必答拒答提交条件为显式策略，拒答不计有效分或任务完成。 | 待执行 |
| C07 Form 报告导出 | 编制→冻结→答题→恢复→FINAL→报告→CSV/ZIP 同源；SAV 结构化数据不能静默截断，拒绝或明确无损形式。 | 待执行 |
| C08 Scale 导入 | 仅合法共享单 responseSet；不扩展标准量表；CAS/摘要/管理审计；不存不必要原 CSV；复用科学定义。 | 待执行 |
| C09 Scale 计时 | 显式可选浏览器有效时间，不改评分/旧 responseTimeMs；课程事实识别 Training，不信 host/作者域；独立默认关闭导出能力，summary 可授权 timing 而不开放 raw；原队列/指纹/产物/下载重新鉴权。 | 待执行 |
| C10 认知开关 | 公共 runtime/报告 worker；目录错误可见；总 flag 关时隐藏新编制/资源/类型且真实准入拒绝、不新增 session/job；历史发布保留，重新开启正常。 | 待执行 |
| C11 SJT 课程链 | 复用正式上传、独立审核、发布、版本锁及公共报告，完整课程发布/学员作答/报告/导出。 | 待执行 |
| C12 SJT 在线编制 | 多情境/多题/受控多选，AUTHOR_KEY_SUM/EXPERT_KEY、人工独立 golden；缺必需机会为 null/not_calculable，不用部分均值冒充完整分。新明确协议才允许全选填空 FINAL，旧空响应不变。 | 待执行 |
| C13 SJT 授权/图片 | 精确 release/hash/course/purpose/expiry；撤销阻止新用且保留合法历史恢复；图片复用资产管道，保留/发布/删除锁一致；分发与改编许可区分。 | 待执行 |
| C14 概率分配 | 每个新 attempt 按权重分配一次并持久化；刷新/恢复/重放不重抽；合法下次可再抽，不承诺精确配额。 | 待执行 |
| C15 分卷编制/权限 | 稳定表单键、SJT 异步授权、课程上下文与事务；私卷报告查询隔离，任务级分析适配，不借普通路径绕过。 | 待执行 |
| C16 配对分析 | 公共数字/配对内核；10/20/50 人查询扩展；重复 attempt 歧义明确拒绝；历史独立测评缺课程来源为不可归属，不按现成员推断。 | 待执行 |
| C17 质量/长宽表 | 仅改分析资格，不改分数/FINAL；排除/不可比为空且注明原因，不误标未答；冻结来源/质量/成员版本指纹，旧产物在变化后重鉴权。 | 待执行 |
| C18 匿名研究治理 | 同意版本不可变；退出为研究审核/排除，不自动删除教育记录；旧 anonymousStudy 正常。 | 待执行 |
| C19 跨工具/END | 服务端依据接受事实计算路径与材料/END；条件初期仅 SINGLE/MULTIPLE/LIKERT；交卷终态与任务 SATISFIED/NOT_SATISFIED 分开且统计/学生列表真实消费；未达工具在父状态/列表/媒体接口均不泄漏。 | 待执行 |
| C20 材料组/配额 | 随机组、KEEP_LINKED、配额独立于概率分卷；匿名 restart 沿用授权主体键并轮换凭证，不重复占配额。 | 待执行 |
| C21 同 IP | 仅显式冻结 round 的新公开链接，最长48h；list/reveal/复制保留真实绑定，hint非凭证；不放宽登录/账号限流；旧 recovery 不因招募token关闭失效，新准入仍检查窗口。 | 待执行 |
| C22 延迟反馈 | 明确 generated-but-not-released 状态，覆盖原生报告/下载/缓存/导出全部出口。 | 待执行 |
| C23 checkpoint/draft | 加密明文64KB、累计100、CAS、显式1–48h TTL，受真实round/课程截止限制；过期清密文保留身份/次数；既有维护每批≤100，锁/SQL/事务超时。新本地认知 TTL 默认关闭，保护未知历史/sealed/重试，跨标签租约与 tombstone 防复活/同attempt重做。 | 待执行 |
| C24 普通 Training UI | 首页纸色/深绿、可访问按钮、错误聚焦；专业认知刺激/计时独立，不进入后续Survey视觉批次。 | 待执行 |
| C25 整合/审查 | 真实角色、全链和组合回归；固定commit审查及针对性修复；未选/跳过/失败不写通过。 | 待执行 |
| C26 性能 | 固定commit/tree/Node/fresh Prisma/迁移/dist，真实 Form+Scale+Cognitive+SJT；单次、连续24/72、逐级1/2/4/8并发；API与worker CPU/RSS、队列排空后heap/external/RSS、SQL和存储；保留失败/优化前后原始数据。 | 未开始 |

新复杂流程策略初期不与概率分卷、anonymousStudy 混用；未实现的组合在编制/发布明确拒绝，不能暗中接纳。跨版本研究需要任务级适配；最终 Training 与 Survey 差距清单保留所有限制。

性能先功能后测量，重型检查与压测串行。导出累计 N 行成本与每次提交成本分列；旧基线仅比其支持的同语义路径，新功能绝对成本或同候选on/off。监控API/worker CPU、RSS、heap/external、PG连接/锁/IO、cgroup节流与发压端；队列排空后观察，不凭RSS未回落断言泄漏。API RSS≥1GiB、可用内存低于2GiB或阶段超过10分钟自动停止该次发压并保留记录。热点检查：重复模板/hash、native media重放前置Form、逐报告授权/策略查询、缓存冷轮转、草稿清理锁。不得用两份SJT代替真实四工具，不并行跑互相污染的压测。

## C14/C15 增量限定结果（2026-10-18）

上表“初始状态”保留计划原文；当前 C14/C15 的详细源码/迁移/动态证据见 `c14-weighted-variants.md` 与 `c14-evidence/`。FULL02 业务源码固定15024877，真实主链、分层报告导出及非空新格式恢复通过；中央 outbox 冷-cache旧null Form六首FINAL并发及既有variant full preview已补充通过；本批最小范围限定功能闭合，正式整合/浏览器/性能仍后续阶段。

本批最小产品边界：2–8组、整数weight1–100、union顺序子序列、完整Form section、相同first context；有限attempt预算且取消耗次；已接收任一FINAL不能restart原attempt。一个parent任务、selected children/active slots，不造私卷parent或未选空事实；owner union编制，个人selected报告，任务按publication/config/group分层，未分配为NOT_SHOWN/不适用。

保留差距：
- C15当前任务分析是完成/状态/任务满意度分层摘要与可用CSV/ZIP；跨人指标、配对完整统计在C16。
- 新variants不与复杂delivery policies、anonymousStudy、关系测评、报告包或无课程私模板混用；明确拒绝，普通null与旧anonymousStudy保持原语义。
- 未移植Survey完整assignment service；共享纯weighted core仅配置/权重/抽样/分配校验。quota/KEEP_LINKED不是本批功能，留C20。
- 主链真实使用Form、Scale、120-trial Cognitive和SJT；隐藏SJT资产探针证明跨slot拒绝，但没有新选中video能力fixture，不能称独立视频能力验收。
- 直接子API的selected guard有定向单元/source检查；FULL02的隐藏单元HTTP覆盖父路由与跨slot探针，未另造不可达隐藏child来声称全部native child入口独立动态覆盖。fullpreview在后续独立cold-final阶段补充真实HTTP200与异teacher拒，未计入FULL02的361请求；清null后旧artifact指纹拒绝仍只有定向/source资格。
- 真浏览器仍C25；本节点既有EPERM结论不重复绕过。C26完整CPU/RSS/DB/吞吐与长时负载尚未执行，pool饥饿诊断及219ms单窗口不是性能收益。全部候选抽前prepare的CPU/解密/编译/媒体查询绝对成本需在C26单列。
- gzip只是证据容器，解压bytes/SHA必须吻合manifest；原失败与旧runtime通过范围保持，不把重用数据当作当前runtime重测。

## C16/C17 增量限定结果（2026-10-18 14:16 UTC）

上表仍保留初始状态。课程跨人描述/配对、独立质量审核与原队列长宽表/字典已完成限定功能动态检查；最终固定证据 review 进行中。证据按 HTTP01–07 的冻结来源逐项保留，见 `c16-analysis.md` 和 `c16-evidence/`，不把失败 aggregate 改写为通过。手算四工具、真实 PG 25-query 固定来源扩展、权限与质量竞态、旧事实不变及非空恢复已覆盖；正式浏览器/全平台整合和容量仍属 C25/C26。

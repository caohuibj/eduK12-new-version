# GitHub 候选来源 → 后台入库要求（只读基线）

**结论先行：**现在可继续筛选优质来源、整理任务内容包要求，不能把“源码存在”写成“已可在 Survey 使用”。真实基线有 **24 个任务家族、28 个真实执行身份**；另有 1 个 `fake` 测试身份。Survey 仍是固定 Go/No-Go 入口。无依据的能力总分、同龄百分位不能成为接入前提；缺少平台承载能力就登记阻碍，不在内容分支补平台。

依据：`caohuibj/eduK12-new-version@ff8471e529e7b3c56e1e20f17d1e2581040fc896`。只用该提交的 `git show/grep` 审阅；当前工作树的 visualsearch 草稿、其他分支及 PR #356 实现均未计入。未改仓库、未启动服务/数据库/测试/CI。本文件及 JSON 是**研究登记模板，不是实际入库、发布或验收结果**。

## 1. 先去重，再决定候选的价值

[基线 catalog 27–50 行][catalog]列出的 24 家族如下；[执行身份清单][identities]中 reaction、memory、stroop、bart 各有两种评分身份，版本不计作新范式。

| 对照组（仅用于筛选） | 已有任务 key |
|---|---|
| 反应、注意与干扰 | `reaction`、`patterncompare`、`cpt`、`stroop`、`flanker` |
| 抑制与规则转换 | `gonogo`、`sst`、`taskswitch`、`cardsort`、`trailmaking` |
| 存储、更新与学习 | `memory`（数字顺背）、`digitbackward`、`corsi`、`nback`、`picturesequence`、`pairedassociate`、`wordlist` |
| 推理、空间与规划 | `matrix`、`mentalrotation`、`tower` |
| 决策、语言与情绪 | `reversallearning`、`bart`、`lexicaldecision`、`emotionrecognition` |

每个来源标记 `existing_family_evidence`（补充实现/证据）、`protocol_variant`（新协议变体）、`new_family_candidate`（新增家族候选）或 `unresolved`。逐项比较**刺激与生成机制、反应规则、试次/阶段、随机化、计分公式和测量对象**；同名不保证同协议，同构念也不等于同任务。换主题、语言、仓库、框架或评分版本不自动增加家族数；如隐式规则发现的卡片分类不能仅凭名称与已有显式规则 cardsort 等同。`visualsearch` 不在此基线 catalog，工作树草稿不是已完成能力。

版权去向（可 GitHub 公开／获权后系统用但不公开／待联系授权）与实现策略（代码适配／文献自研／暂缓）独立登记，代码和刺激材料分别判定；私有使用不代替授权。

登记来源时固定 GitHub 仓库＋完整 commit＋具体任务/计分/许可证路径；把代码许可、图片/词表/音频等刺激许可、量表/任务商标与原作者署名分别核对。无许可证不能当作“可复制开源”；可以保留为文献/设计线索，复制资格须另查。星数、可运行 demo 和论文引用均不能代替协议、授权及测量质量证据。代码注册也不代表数据库配置已发布或用户有权使用；实际生命周期以 `CognitiveTestConfig.status` 为准。[契约说明][lifecycle]

## 2. 候选必须适配的现有边界

| 项目 | 基线事实 → 候选要求 |
|---|---|
| 注册/版本 | 静态 `testType/engineVersion/scoringVersion` 精确查找，无运行时上传注册、热更新或“找最新版”回退。新任务需任务包、后端 config/trial schema＋纯 scorer、前端 runner、治理/刺激/呈现/fixture 等对应材料；本轮只整理，不实现。[注册][registry]、[任务包][package] |
| **legacy 计分** | `CognitiveScoreResult.score` 是必需 `number`，另有 metrics/qualityFlags。不能把它改成 null 来假称现接口支持；也不能为了满足类型发明 0–100 能力分。[旧契约][legacy]、[BART][bart] BART 历史 `score:0` 是明确隐藏的兼容占位，并非可复用的科学分数。新任务若无合理 score，要先登记契约承载问题。 |
| **v2 结果** | v2 scorer/result 没有总体 score，只有 metrics、三态 quality、audit 等；指标容许 null，方向含 `signed/descriptive`，不足时保留 null，差值/斜率/d′ 的负数不能裁成零。**但现有 v2 registry 仍调用 legacy entry.score 再丢弃 score**，并非已经有任意 native-v2 任务直接注册通道。[v2 类型][v2-types]、[适配入口][v2-adapter]、[null 规则][nullable]、[有符号指标][signed] |
| 冻结与历史 | 发布/分配冻结 profile、config/hash、指标/质量/报告/呈现版本；会话冻结协议签名及 engine/scoring/config，完成后保存结果和报告。报告读取使用已存快照，不借新模板重算旧结果。新参数、新刺激、新解释需新身份/版本绑定。[发布冻结][freeze]、[结果快照][completion] |
| 记录与导出 | 试次 envelope 有 index、phase、condition、performance 起止/时长、timeout/premature、质量事件和 payload；原始提交另含 attemptEpoch、可选施测来源。候选要给出逐字段字典、单位、缺失语义、随机种子重放及计分所需充分字段；不要只交总正确率。现有 research-long 有 sessions/metrics/trials/字典；**v2 导出指标字典仍查精确版本 registry**，不是全链路仅查冻结定义。需要更强冻结导出保证的候选登记待平台核对。[试次字段][raw-types]、[原始提交][raw-storage]、[导出字典][export] |
| 无效结果 | `interpretable/limited/invalid` 与指标级 gate 分开；invalid 的用户报告 headline/user/detail 为空，参照被抑制；limited 仅隐藏受 gate 影响的指标并说明限制。内部保存的原始指标不是用户结论；页面不得绕过报告直接展示全部 metrics。缺测不是 0，输入矛盾/版本不符应拒绝，不转换成“低能力”。[质量状态][quality]、[报告过滤][report]、[参照过滤][references] |

**仅 Survey 的固定限制：**`gonogo-software-frame-v1`，config `1.1.0`、engine/scoring `1.0.0`；120 次、No-Go 比例 0.25、刺激 800 ms、间隔 500 ms、有效 RT 下界 100 ms；桌面键盘、整单元最多重做 1 次、PILOT、无常模。反馈仅 GENERAL 或 DESCRIPTIVE，后者只允许 `hitRate/goMedianRtMs`；来源还须 PUBLISHED＋OPEN 且 config 哈希相同。[固定模板][survey]、[来源准入][survey-admission] 这些是**本固定协议事实，不是其他候选的通用推荐参数或科学阈值**。其他家族/变体、参数编辑、额外反馈指标不能因通用 runner 已存在就声称 Survey 支持。

## 3. 一张通用质控卡：工具、参数、阈值、文字报告

各类候选共用 `candidate-qc-template.json`；未知填 null/未核实，不能填“通过”。来源优质与本平台已具备承载能力分开判定。

| 区块 | 每项候选最少交付 |
|---|---|
| 工具/来源 | 普通用户名称与一句话操作；具体 GitHub 固定提交/路径；原始范式文献；版权及刺激来源；与 24 家族的比较；浏览器/设备/输入限制；用途、人群、语言、疲劳与可及性风险。框架是运行工具，不能当作任务已验证。 |
| 参数/原始字段 | 练习、正式/学习/延迟阶段，试次数/条件数/比例、刺激/间隔/超时、输入映射、随机化/种子、停止/自适应规则、刺激版本。分别记录来源默认值与本项目拟用值、变化理由和测量影响；原协议参数**不一概叫阈值**。每个指标给公式、分母、纳入/剔除规则、单位、方向、null 条件、质量 gate。 |
| 四类阈值 | 按下表逐条标识来源与用途；不能把文献经验、理论参照、工程门槛或暂定规则包装成常模。没有适用阈值也可只做描述性报告。 |
| 文字报告 | 首屏先说“本次做了什么/记录了什么/是否足以解释”，少量直观指标用次数、比例、毫秒并给分母；专业公式、d′/SSRT/斜率等放研究层，不堆到普通用户首屏。每句反馈绑定真实指标、质量状态与适用范围。给出可解释/受限/无效三份文字样例，避免“抑制能力差”“智力低”等泛化或诊断。 |
| 验证材料清单 | 只登记未来需要的准确范围：正常 golden、空/不足、超时/提前反应/中断、非法序列、null/负值、版本重放、报告隐藏和导出语义；当前未执行。既有 onboarding 最少要求 golden/empty/insufficient，技术、Pilot 发布、科学等级独立，不能用合成 fixture 当人群效度证据。[最少样例][fixtures]、[科学证据][governance] |

四类使用**用户确认的固定命名**；“类型”与“用途（参数边界/质量/描述性比较/反馈）”是两个字段：

| 类型 | 可做什么 | 必须披露 / 不可暗示 |
|---|---|---|
| **技术质量规则** | 检查计时、输入完整性、超时、丢帧/中断、有效试次数等 | 规则版本、设备/协议、触发后果；不据此划分能力高低。 |
| **理论参照** | 例如满足假设时的机会正确率、任务理论范围 | 明确模型假设；`1/k` 仅在 k 项等概率猜测等条件下成立，不是同龄常模或诊断界值。 |
| **文献经验** | 原研究的剔除规则、经验区间或实证样本比较 | 原文位置、样本量/年龄/语言/设备、协议和统计不确定性；本项目未来实证数据另注其来源。外样本结果不能直接迁移。 |
| **项目暂定研究者规则** | 在缺证据时透明设定研究操作/质量提示规则 | 显示“项目暂定”；给负责人、理由、版本、复核条件，禁止用于能力等级/人群百分位；不伪称文献共识。 |

每条阈值均记录 `数值/表达式＋单位＋比较符＋作用对象＋用途＋证据链接/定位＋适用协议/人群＋触发后果＋限制＋复核条件`。未找到来源时退回项目暂定或保持未定，不能编造引用。常模/百分位需另有**对应版本、profile、resolvedConfigHash 与人群**的真实适用证据和获准参考绑定；“有论文/有经验区间”不等于可出百分位。[参照准入][reference-gate]

普通用户文案例：可解释时“本次需要按键的项目中，你正确回应了 {hits}/{goTrials} 次；有效回应的中位用时为 {rt} 毫秒。它描述本次记录，不代表同龄排名。”受限时“部分记录受到中断影响，相关结果暂不解释。”无效时“本次有效记录不足，暂不提供表现结论。”各模板只能在实际字段及相应质量规则满足时使用，不自动建议反复重测。

## 4. 缺能力时怎样登记，不混入内容分支

沿用现有 blocker 字段：`code/domain/gate/file/fieldPath/message/expected/actual`，`remediation.type=PLATFORM_CAPABILITY`。[阻碍契约][blocker] 另在研究登记外层关联候选、具体用户影响、最小所需能力、依赖任务和复核证据。模板未完成时保留“未执行/待核对”，**不要伪造 onboarding ready/PASS**。

- 需无总体 score 的原生注册、不同 phase/媒体/同步输入、自适应/长程日志等，先对精确接口核对；缺口明确才登记，不把整个框架移植进去。
- Survey 非固定 Go/No-Go、参数或反馈扩充，以及候选确实依赖的冻结导出保证，记为**本基线不满足/需复核的平台依赖**；交给 PR #356 对应平台负责人按其最终固定提交核对，**不判断当前 #356 是否已修、已测或已发布**。
- 候选内容包可以继续完善许可证、协议映射、参数与四类阈值、报告文案；依赖未解除前状态为 `SOURCE_RESEARCH_ONLY` 或 `BLOCKED_PLATFORM`，不宣称完成入库、不改 registry/共享服务/DB/CI。

配套：`baseline-family-map.json` 保留全部家族与并存版本；`candidate-qc-template.json` 是可复制填写的研究卡与阻碍示例，非后台可直接导入格式。

[catalog]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/generated/catalog.ts#L27-L50
[identities]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/generated/identities.json#L4-L149
[lifecycle]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/types.ts#L190-L205
[registry]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/cognitive.registry.ts#L4-L28
[package]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/tasks/trailmaking/task-package.json#L5-L48
[legacy]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/cognitive.types.ts#L21-L52
[bart]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/scoring/bart.v1.ts#L54-L67
[v2-types]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/types.ts#L18-L43
[v2-adapter]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/registry.ts#L152-L195
[nullable]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/onboarding/fixtures.ts#L201-L250
[signed]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/scoring/stroop.v1.ts#L72-L91
[freeze]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/profile-freeze.ts#L95-L130
[completion]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/completion.service.ts#L113-L234
[raw-types]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/types.ts#L72-L109
[raw-storage]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/unified-raw-submission.ts#L12-L30
[export]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/export.service.ts#L459-L481
[quality]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/quality.ts#L9-L39
[report]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/report.ts#L247-L284
[references]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/result-snapshot.ts#L33-L36
[survey]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/survey/cognitive.definition.ts#L8-L80
[survey-admission]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/survey/catalog.sources.ts#L194-L200
[fixtures]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/onboarding/fixtures.ts#L110-L117
[governance]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/onboarding/governance.ts#L47-L85
[reference-gate]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/v2/publication-gate.ts#L99-L125
[blocker]: https://github.com/caohuibj/eduK12-new-version/blob/ff8471e529e7b3c56e1e20f17d1e2581040fc896/server-version/backend/src/modules/cognitive/onboarding/decision.ts#L4-L33

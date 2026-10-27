# ANT/PANT 纯逻辑候选 · 2026-10-26

稳定ID：`attention-ant-pebl`。工作分支 `cognitive-next-three-core-20261026`，实施基线 `9969583b2c95fa87ff44a4f2b3aa68cbd7471390`。本目录与新增后端候选是下一阶段 runner 的可审阅契约，不是已入库、已上线、效度已验证或四入口已接通。归档的 design/preview/evidence 未修改；用户批准三张设计图不代替协议差异与科学阈值确认。

## 实际范围与检查预算

新增 `server-version/backend/src/modules/cognitive/content-candidates/ant/{protocol,schema,scorer,package,metadata}.ts` 和单文件 `src/__tests__/cognitive/ant-candidate.test.ts`。不改共享core、全局registry、正式runner、DB、COS、锁文件、其他候选或归档设计；不commit/push/CI/部署。

修改纯协议/计分/报告投影 → 可能错排条件、错算RT/分母、把受限结果泄漏到报告 → 云端Node 24.21.0与已锁定依赖运行该测试单文件、1 worker → 复用已合格条件与schema证据；仅重验实际变化项 → 单轮预计1秒内测试执行（工具等待另计）。类型语义闭包由主线统一核验，本文不宣称全量tsc通过。原始运行见evidence.json和Vitest JSON。

## 两版与明确变式

- research：24次独立练习＋3块×96=288正式。每块4线索×2位置×2方向×3侧翼×2重复；完整48格各6次，线索各72、侧翼各96。
- experience：同24练习＋1块×48正式，完整48格各1次；线索各12、侧翼各16。只减重复次数/块数；不改刺激、单次时序或计分。每格只有1次，不能据此推断稳定注意网络能力，也没有招聘预测/诊断效度证据。
- 正式起点间隔4000ms；不是回应后额外等4秒。400–1599ms整数预线索间隔是本项目明确的离散随机化选择，随后100ms线索、400ms注视、目标至首回应或1700ms。最后一条也记录4000ms试次结束。研究正式理论19.2分钟、短版3.2分钟；加24练习1.6分钟、说明/校准/休息，不能承诺短版总计3分钟。estimatedMinutes为负担估计，不是实测。
- 无提示条件仍记录同一“线索阶段”的开始/结束标记，但不显示可见线索。
- `neutralVariant='absent'` 为候选默认，依据已审PEBL PANT1.2的无侧翼默认，**不是声称与Fan2002横杠中性相同**。`dashes`是另一显式配置，各profile×variant产生独立configHash；不在结果中合并。这个默认让纯逻辑可以开发，不代替最终施测的协议确认。
- 原始seed接受1–256 UTF-16字符。FNV1a→mulberry32、Fisher–Yates顺序、块独立流与试次jitter流版本固定；24练习使用独立流，从48格无放回取24，不保证练习全因子平衡，不计正式分母。保存seed和逐试次计划真值以核对/重放，不保存“找到最新版”引用。

## 原始数据与权威计分

冻结tuple由现有 `createSessionConfigSnapshot` 产生，保留engine/scorer/config、configHash与完整protocolSignature。scorer自身再次验证快照hash/签名、精确identity/协议，以及input.config=frozen.config；有重算合法签名的外来协议也拒绝。未实现本候选的UNIFIED_V1适配，因此拒绝该runtimeGeneration，不伪称兼容。

每次正式记录保存：条件、block/index、变式、计划预间隔、performance clock/timeOrigin（未知为null）、真实阶段起止、首响应事件索引、最多32个有序输入事件（真实input、方向、repeat/held、时间）、最多32个原始中断、overflow、timeout与recordOrigin。native envelope的qualityEvents上限20，桥接只投影前20；32条原始中断完整保留，任一都会触发技术排除，不靠被截短的envelope判断质量。所有阶段/输入/中断均需位于真实试次时段且有序；同origin的跨块也拒绝重叠，只允许块间休息延长；origin变化有独立排除原因，不跨时钟推算RT。

首个非held、非repeat、位于`[targetOnset,targetOnset+1700)`的事件才是响应。错误首响应不会被后续正确响应覆盖。恰在1700ms的事件是晚到记录，保留原始事件，仍按超时；超时不伪造0或1700ms RT。提前输入保留并技术排除，后续正确事件不能把该试次变合格。中断/缺阶段/恢复无时序/overflow/未知时钟起源/时序偏离等保留原始记录并排除；非法seed真值、顺序、时钟、伪造首响应或flag则拒绝整个输入。

准确率分母包含所有**技术合格正式试次**，错误与完整超时均计入。内部可保留局部描述；公开全局准确率需完整冻结分母。正确反应RT是**算术均值**，只含正确首响应，明确单位ms与correct count；不把它命名为中位数。`alerting=none−double`，`orienting=central−spatial_valid`，`conflict=incongruent−congruent`，不裁负值，真实0保留。每个差值分别检查组成条件全额有效次数和至少一个正确反应；后者仅是算术定义条件，不是可靠性阈值。块计分没有复用PEBL累积数组。

触控、pointer（鼠标/笔等pointer具体类别仍待runner设备层区分）和键盘各有独立RT count/sum/mean；没有总RT。出现多种实际响应输入时公开RT比较全部隐藏，原始分层记录仍保留。错误响应的输入也计入来源，超时不猜输入；技术排除记录中的已接受响应仍保留输入，混用门控是保守的。

## 质量与报告

技术完整性规则、理论差值、文献参数、项目暂定规则分开登记在rule-register.json。特别是**20ms phaseToleranceMs是新增的项目暂定技术规则**：取约一个60Hz刷新周期16.67ms再留记录/调度余量，未验证其适用于真实60/90/120Hz设备。它既不是文献阈值、实机校准结论，也不是截图批准的科学证据。试行前由认知内容负责人和平台时序负责人复核；如改数值需新config/hash与兼容检查，不能静默重分析旧结果。

完整条件要求等于计划有效次数是项目保守的公开门控，不代表经验性的可靠性界值。至少一个完整线索条件才允许部分描述，否则invalid。全错/全超时可保留准确率0，RT为null，整体limited；不是假0分或自动给低能力标签。

`projectAntReport`为本候选用户/报告/摘要导出的唯一公开投影：invalid无表现；limited按条件隐藏受影响指标；完整且有定义的描述可展示。投影既查state，也查每项gate、真实分母、正确数与RT count/sum，不允许只把state改成interpretable就绕过。公开全局正确率与各cue正确数之和绑定；差值与两个正确RT分母及均值绑定。不透传内部metrics对象，不造总分/同龄排名/能力等级。

报告默认简短文字＋真实次数/正确率/允许的条件差值，无强制图片。以后确有必要才加入至多一张小take-home图并标EDUK12.TOP；正式刺激阶段无品牌、用途或能力标签。中英指导语为项目自编，尚未完成理解研究与翻译验证，正式UI的英文投影文案仍须runner阶段完善。

## 许可、标签与平台边界

metadata.ts保留原18维来源研究标签，另列当前实现状态、touch-first、四种多场景需求、年龄null/未核、操作难度、中文/英文与限制。历史`input_proposed`和`maturity`保留历史原值，不冒充实际已实现或已接后台。标签没有持久化/过滤/搜索消费者接线；学习困难辅助和招聘研究是待验证需求，不是诊断或录用效度授权。

协议与来源事实沿已固定证据，不重新广搜。PEBL固定上游SHA为`eb22a0725d765a0597a4905920ad3c603b1c9ae8`，项目卡固定快照`22721e5c63dd78819e8c58921adf20157cdaa08c`；完整sourceEvidence在metadata.ts。PEBL GPL-2.0仍约束其代码取用；本实现为独立纯逻辑/事实自研，不复制其DSL表达，不擅自宣布上游或项目改授MIT。未引入外部字体、图片、音频或刺激文件；后续几何/字体/译文/署名分别核权。

真实准入依赖静态定位：`v2/publication-gate.ts` 的 `validateTaskDefinition` 仍要求`profiles.standard`，本候选只交付用户要求的research/experience，未造第三版别名；正式注册与legacy numeric score消费者也未适配。下一步由平台线明确两profile原生准入、发布/冻结与消费者契约；本候选不填假0–100分绕过。没有正式runner、API、DB/COS保存、设备层会话快照、四入口共享呈现、移动实机时序、中文理解或人群/常模研究。客户端performance为自报时钟，服务器校验一致性不等于证明物理刺激实际出现。

## 兼容组合

| engine/scorer/config | profile | neutralVariant | RNG/协议 | 参照 | 结果 |
|---|---|---|---|---|---|
| 1.0.0/1.0.0/1.0.0 | research | absent或dashes各自冻结 | ant-fnv1a-mulberry32-v1 / ant/1.0.0/1.0.0 | 空 | 候选可计分，不表示正式可发布 |
| 同上 | experience | absent或dashes各自冻结 | 同上 | 空 | 短版描述，不借用长版可靠性/常模 |
| 任意未知版本/更改配置未改hash/外来protocol | 任意 | 任意 | 任意 | 任意 | 拒绝 |
| UNIFIED_V1、legacy总分、standard profile | 任意 | 任意 | 未适配 | 未适配 | 平台依赖，不静默降级 |

四个实际configHash、protocolSignature及冻结快照见frozen-examples.json。metricDefinitionVersion/qualityDefinitionVersion/reportDefinitionVersion是候选定义身份说明，当前真实SessionConfigSnapshot无这些顶层字段，故不伪称它们已经独立持久化；原生冻结/导出消费者接线前还需平台核验。任何重分析应另产来源明确的新结果，不能覆写历史。

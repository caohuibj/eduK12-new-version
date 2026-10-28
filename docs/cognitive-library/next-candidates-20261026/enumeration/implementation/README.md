# 短时点数判断：内部纯逻辑候选

本阶段只新增独立协议、原始记录合同、确定序列、纯scorer和关闭状态的报告投影。基线为`cognitive-next-three-core-20261026@9969583b2c95fa87ff44a4f2b3aa68cbd7471390`。当前内容未注册、无runner、无正式刺激、无后台标签消费者或数据库/COS接线，不构成完整导入或科学效度证明。

## 用户批准与仍待解决的事项

主agent于2026-10-26回传用户确认：“三个都通过，图片保存notion”。该事件批准本批静态预览与双profile次数：研究版100正式（4×25），体验版25正式（1×25），各有独立3练习。原`design.json`/预览/截图证据保留原样，不把历史`PENDING_APPROVAL`静默改写；最新批准在本目录记录。主agent负责Notion及统一Git操作。

批准不等于真实设备50ms呈现、5°物理几何、遮罩统计、中文/英文理解、年龄/人群适用或个体结论获准。当前配置保留`status=DESIGN_PROPOSAL`，原因是这些测量与质量条件未定稿，不再因为25次缺少用户批准而阻塞。

## 冻结执行范围

修改组件：`server-version/backend/src/modules/cognitive/content-candidates/enumeration/*.ts`，独占单文件测试，以及本implementation目录。共享平台/core、注册、数据库、CI、锁文件、旧截图均不改。

可能故障→必要检查：随机序列不平衡/练习污染→各块数量、独立流与固定向量；truth/seed/时钟篡改→严格schema与权威重建；空记录/非法数/排除→null、真实分母与signed误差；快照漂移→真实v2 hash/signature、exact identity、序列化重放；报告泄露→强制关闭投影及research_only定义。主要位置为云端既有Node24/官方锁定依赖。预算约20分钟，不安装、不全量构建/tsc、CI或生产访问；既有设计截图与不受影响测试不复验。

## 文件与实际契约

- `protocol.ts`：稳定candidate ID与独立执行身份、两profile配置、确定序列。`testType=enumeration`与稳定ID`attention-enumeration-flower`分开。版本使用仓库真实`engineVersion/scoringVersion/configVersion`、protocol key/version、randomizationAlgorithmVersion；内部起点均0.1.0，不新增总版本或normVersion。
- `schema.ts`：严格Zod配置和raw合同，有限时钟、整数1–15、响应/确认一致、滑杆当前值一致、原始事件有界。practice不能进入formal schema。
- `trial-envelope.ts`：保留同一次施测的真实performance时钟，明确formal索引/数量条件，映射现有原生TrialEnvelope，不发明旧score字段。
- `scorer.ts`：parseSessionConfigSnapshot验证configHash/protocolSignature，再核完整版本/协议、输入config与冻结config一致、seed及整个生成顺序。连续正式索引，跨trial下一started不能早于上一ended；时钟重置/跨页面恢复需未来显式新契约，不能静默换原点。
- `package.ts`：直接注入隔离测试的原生v2 TaskDefinition及createSessionConfigSnapshot包装，只有research/experience，references为空。无legacy adapter、无注册或标准版占位。预计耗时仅规划估计，未据真人测量。
- `metadata.ts`：保留18维原key和原词条；当前阶段/已批准输入在独立扩展中记录。年龄和难度未核；多场景是研究/自我探索提案，学习与招聘不代表诊断或预测效度。未声明后台可检索。

## 序列与输入

正式数量5–9，各块每数量5次；研究版每数量20次，体验版每数量5次。练习为3、4、5各一次，独立调用不消耗正式随机流。正式首块在两profile相同seed下完全一致，后续研究块继续独立生成。

算法`enumeration-fnv1a-utf16-mulberry32-fisher-yates-v1`：FNV-1a按UTF-16 code unit折叠，Mulberry32生成[0,1)，Fisher–Yates逆序交换。块order流`seed:formal:block:index`，滑杆流`seed:phase:slider:trialIndex`；phase是`test`或`practice`。生成顺序、原seed、算法标识、块内序号、真实数量、滑杆初值都进入plan，由scorer重建。初值为1–15等宽区间的整数随机值；不限制回答为5–9。算法不用于安全/防作弊证明。未生成点位置或遮罩，也未把代码7°/论文5°或名义50ms硬写成已获准执行合同。

原始合同保存响应phase onset、确认时间、最终整数、实际输入touch/pointer/keyboard与有界sliderChanges。允许不移动滑杆直接确认当前初值；有移动则确认值必须等于最后变化值。RT是确认减回答页面onset，包含操作时间，不能叫感知速度。缺失作答为null，不能以0代表。临时预算上限512滑杆变化、20中断、10000提前输入计数等是技术有界合同，非科学时序阈值；超界拒绝，不截断。

## 质量与计分

所有数值仅为内部研究描述，`interpretationPolicy=research_provisional`。`minimumValidPerCondition`、`timingToleranceMs`、`stimulusRecipe`固定null；不能用客户端配置开关绕过。无个体结论所需证据时，quality为invalid；即使外部伪造interpretable/limited，报告投影仍返回invalid、null headline和空rows。原生报告三个指标数组也为空，所有指标research_only、export.summary=false、referenceEligible=false。研究metrics不是系统最终用户报告；后续权限导出消费者仍须审查。

技术纳入仅代表这些明示缺失/中断事实未触发，不表示曝光、mask或校准真实合格：客户端报告的时钟/帧摘要存在、正帧计数、无overflow、存在校准/刺激引用、记录非恢复/超时/提前输入/中断、有完整确认。引用只代表记录中的标识，不校验真实校准或刺激内容；全局解释阻断正用于防止将这些自报事实升级为验证。零帧按“没有呈现证据”排除；没有移植MOT帧数、50ms容差、最小有效次数或正确率gate。错答与很慢的操作不被自动排除。非法序列/clock/seed/非有限值直接拒绝，不当作可忽略记录。

| 内部指标 | 单位/分母 | null与符号 |
| --- | --- | --- |
| byQuantity.accuracy | 正确数/该数量技术纳入数，ratio | 分母0为null；真实0保留 |
| byQuantity.signedMeanError | mean(回答−真实数量)，count | 分母0为null；负偏差保留 |
| byQuantity.meanAbsoluteError | mean(abs(回答−真实数量))，count | 分母0为null |
| byQuantity.medianReportOperationMs | 同批技术纳入记录的响应操作时长中位数，ms | 分母0为null；不解释为感知速度 |
| overallAccuracy/signedMeanError/meanAbsoluteError | 全部技术纳入正式记录，仅内部聚合 | 空为null；不因条件缺失而给用户聚合 |
| expected/received/included/excluded | 各为独立count | 未收到不算已排除；不补伪造记录 |

四类规则分开：exact-match为理论/定义参照；100次/各数量20次来自文献经验；缺失、非法与中断是技术质量事实/暂定排除规则；25次、误差聚合及当前保守关闭为项目研发规则。后者不是人群正常值或诊断界值。内容线负责复核，复核条件是协议/物理呈现/输入/质量与试点证据发生变化。没有真实常模或参照绑定。

## 兼容矩阵与后续版本影响

| 允许的内部组合 | 不允许的组合 | 后续条件 |
| --- | --- | --- |
| enumeration engine/scorer/config/protocol0.1.0 + research100/4块 + exact hash +当前算法 +report0.1.0关闭 | experience与100次数/4块混配，任意新增阈值/刺激recipe，旧/未知版本或改协议却只改签名 | 新协议/参数冻结需重新评估版本与参考适配 |
| 同上 +experience25/1块+exact hash；与research共协议signature，configHash分开 | 偷加standard、假0–100、把两profile混常模或旧冻结找最新版 | 短版精度/负担另研究 |
| 序列化的原快照/seed/全部raw不变的显式重放 | 换seed、改truth、重复/跳过/调序、practice混formal、session时钟重置 | 改计分或重分析另产结果，保留来源，不覆盖历史 |

变更分类：首次新增数据合同/随机化/指标语义，属于测量层+参数层+关闭状态报告层，不是纯文案。未来真实stimulus/mask/几何、指导语、输入布局和时序规则需重审engine/protocol/config及参照兼容；算法变化改randomization版本；指标分母/公式变化评估scoring/metric定义；报告解释分组变化不能当纯文案。实际profileDefinitionVersion/metricDefinitionVersion/qualityDefinitionVersion等由平台真实编译/冻结路径落地，本候选不凭空给TaskDefinition新增字段。

## 来源与许可

固定项目卡：`caohuibj/eduK12-new-version@22721e5c63dd78819e8c58921adf20157cdaa08c`，`docs/cognitive-library/task-selection-20261026/attention-task-cards.json#/cards/2`与原18维目录。上游：`flowersteam/cognitive-testbattery@58ba32fa8b582bedac65ef1c037c9974303dbf5c`的`js/app_enumeration/config.js`和`scene_testtrial.js`。论文：Adolphe et al.2022，doi:10.3389/fpsyg.2022.880375，§2.4.2；原文由主agent本轮定向复核：白点、中灰、点0.5°、直径5°范围、50ms、每数量20次。代码使用7°方形采样；具体采样边界、RGB/物理亮度、遮罩统计未完全核实。本阶段不扩大研究搜索，也不执行上游。

实现为文献自研纯逻辑；上游代码MIT记录与素材授权分轴。未复制noise.png、字体、图像或p5运行器。素材未落地，后续必须独立审查并冻结。GPL/NC/SA等许可不会被当成科学质量扣分。

## 实际验证

`check-run1.json`记录命令/退出/源码和依赖哈希；`vitest-run1.json`为未改写原始结果：21项、20通过、1失败，实际exit1。失败是测试把重复index0的第26条当预算fixture，平台先正确拒绝非连续索引；测试预期/budget/与实际错误不匹配，没有弱化产品校验。

修正为research生成的26条连续记录送入25次profile后，只执行原失败项与新增PRNG固定向量（独立Python无符号整数参考）：`vitest-run2-targeted.json`为2通过、20跳过、exit0。合计22项有合格证据，不声称22项在第二轮全部执行。原20项的代码/依赖输入保持一致，只修改失败用例和追加新用例；原/新测试全文保存在本目录并与各轮哈希对应。另一个固定向量辅助命令曾因缺少`Path`导入而exit1，发生在写入新向量前；修复导入后才生成，未改原测试报告。

覆盖：100/25平衡、独立practice、全部1–15、确定重放、合法上下界、负/零/空/排除、非有限值、输入/确认/slider一致、非法/篡改序列、seed/算法、时钟顺序与跨记录原点、版本/配置/协议/快照哈希不兼容、报告无法绕过gate。测试里50ms、帧数和校准引用全部是合成fixture，不是真设备或科学容差证据。

没有全量tsc/构建/CI、API/DB、COS上传/归档、正式四入口、真实手机/平板/刷新率时序、物理校准/遮罩/刺激、语言理解、人群效度、负载容量验收。未安装依赖，未访问用户Mac文件/终端/浏览器，未commit/push/合并/部署。

下一阶段需主agent完成纯逻辑审阅后授权runner范围，解析真实session context/归档/发布门禁接口并处理物理呈现与质量规则；不得凭此候选已存在而宣称入库可用。

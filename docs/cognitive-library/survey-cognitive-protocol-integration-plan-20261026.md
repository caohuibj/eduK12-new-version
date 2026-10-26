# Survey 通用认知协议接入计划（PR356 平台线，2026-10-26）

状态：计划文档，供评审与认知内容线对接。除本文件外无任何实现改动。基准：PR356 head `83a2169a4`（main ff8471e52 已吸收）。认知内容线分支 `content/dot-cognitive-library-20261026`（基线 ff8471e52）；旧 Simon 线 head `5d9b1741abf37dac10bb7b9a87e203702e296e01`（merge-base `d33b70b14`，自身 66 文件）。

## 1. 当前接口差异（已核实源码）

| 维度 | 当前 main/356 现状 | 目标 |
| --- | --- | --- |
| Survey 模板身份 | `cognitive.definition.ts` 用 zod literal 锁死 `gonogo-software-frame-v1` | 显式注册的协议集合（registry 驱动），未知身份拒绝、不回退 latest |
| 配置 | `SURVEY_GONOGO_CONFIG` 硬编码（120 试次、nogo 0.25、800/500ms） | 配置来自冻结协议（configVersion+configHash 绑定），试次预算按协议 |
| FINAL 校验 | `validateAndNormalizeTrials maxTrials:120` 写死 | 预算取自冻结协议；后端重建刺激真值并重算（authoritative-scorer） |
| 反馈指标 | `metricKeys` 枚举仅 `hitRate/goMedianRtMs` | 指标来自任务定义的 metric exports（按协议白名单） |
| 设备/时序策略 | `FrozenSurveyCognitive` 硬编码 `software-frame-v1`+`DESKTOP_KEYBOARD` | 随协议声明；`software-frame-v1` 白名单仍仅对已核精确版本放行 |
| DB 约束 | main 仅有不可变触发器（20261017050000）；无协议/试次约束（应用层校验） | 冻结父级身份+试次数与冻结协议一致的 DB 守卫（不硬编码 per-template CASE） |
| v2 平台 | registry（build/list/get by key+versions）、publication-gate（readiness）、library catalog（25 族=24 真实+fake）、session-snapshot、trial-envelope、authoritative-scorer 均已存在 | 直接复用，作为"显式注册"的底座 |
| Training | 消费既有通用认知配置（legacy 路径）；无 native-v2 消费、无版本桥接 | 桥接矩阵+实现；不为旧接口捏造 0–100 综合分 |
| 前端 | `ResearchCognitivePreview` 已用共享 `useRunnerPreparation`（保留） | 编辑器按注册协议选择任务；Preview 不回退旧 useEffect 补丁 |

旧 Simon 线三个真实前置：`11f2551d0`（native-v2 注册+闭合 Survey 协议分发）、`dc2f934fa`（精确父协议 DB 约束）、`5d9b1741`（Simon 任务与接线）。不可用远端确认的 `97abe643`/`6da0f5fe`。

## 2. 可复用 Simon 部分（定向整合，不整文件覆盖）

- **直接复用（内容包）**：`cognitive/tasks/simon/{schema,sequence,scorer,scientific,participant-presentation,governance,seeds,package}.ts`、前端 `SimonTask.tsx`/`simon.registry.ts`/`tasks/simon/sequence.ts`、golden 与来源记录。generated 文件（backend `generated/*`、frontend `generated/runners.ts`）在新基线用 `scripts/cognitive/manifests.cjs` 重生，不拷旧产物。
- **概念复用（重设计后落地）**：`dc2f934fa` 的"FINAL 绑定唯一冻结 COGNITIVE 父槽+publication+measurementDigest"DB 守卫——保留绑定强度，去掉 `CASE 'gonogo'→120/'simon'→100` 硬编码，改为读取冻结单元的协议块（期望试次数=冻结协议声明值）。
- **测试复用**：`simon.scoring`、`simon-protocol.contract`、`cognitive-protocol-migration.sql`（事务内建临时 schema 自检迁移，八类拒绝用例）作为每协议验收模板；`SURVEY-ACCEPTANCE.md` 结构作为任务级验收文档模板。
- **不直接合入**：编辑器/Preview 的旧补丁（现树已有更新的共享实现）、generated 旧产物、与现 main 冲突的 survey 层文件（按当前 main 定向重做）。

## 3. 必要平台改动

1. **Survey 协议注册表**：新 `survey/cognitive.protocols.ts`——每个协议一条显式记录 `{protocolKey, testType, engineVersion, configVersion, scoringVersion, configHash, trialBudget, devicePolicy, timingPolicy, feedbackMetricKeys, readiness}`，来源=v2 registry + publication-gate 校验；`cognitiveDraftSchema.templateKey` 从 literal 改 enum(注册键)；gonogo 以现有精确身份注册为第一条（历史冻结快照与 digest 不变）。
2. **冻结链贯通**：`compileResearchCognitive` 绑定全套身份（testType/config/engine/scoring/configHash/父发布身份）；编辑器只能从注册表选择；发布时一次校验并冻结（复用 355 一次发布合同）；未知身份/预算不符拒绝。
3. **FINAL 权威计分**：maxTrials 取冻结预算；按 seed 重建刺激序列校验真值，得分由 authoritative-scorer 重算，不信客户端自报；练习试次不入正式计分（Simon 的 20 练习→100 正式模式推广为协议声明）。
4. **DB 迁移**：新增守卫触发器（读取冻结父单元协议块校验 trial_count 与身份一致）；保留 20261017 不可变触发器；不重写任何既有 FINAL。
5. **反馈与报告**：metricKeys 按协议白名单；报告走真实后台链路（result snapshot+冻结报告身份）；初步阈值按四类证据等级（技术质量/理论参照/文献经验/本项目暂定）版本化记录，映射现有参数模型，最小差异扩展，不建平行评分库；无依据时保持描述性反馈，不编造百分位。
6. **Training 桥接**：列清 legacy↔native-v2 支持矩阵；桥接只在有真实定义处提供，其余显式 unsupported；不为适配旧接口给原生任务捏造 0–100 综合分。
7. **前端**：编辑器任务选择（仅注册协议）；Preview 保留 `useRunnerPreparation`。

## 4. 迁移与回退边界

- 仅新增迁移；main 基线库无旧 CASE 约束需要拆除（该约束只存在于旧 Simon 线环境）。
- gonogo 历史发布/FINAL 零改动：注册身份与现有冻结 digest 完全一致。
- 回退=注册表回缩+触发器 drop；schema 加性保留；已有结果不可变（沿用 20261017 触发器）；存在新协议 FINAL 后回退只停新准入，不恢复任何"仅 gonogo"旧约束。
- 历史作答、已冻结协议与计分版本不因接入新任务漂移；新阈值发布不静默重算旧答卷。

## 5. 适用检查（分层取证，只复验受影响项）

1. 合同/单测：registry+manifests 完整性、simon scoring、trial-envelope、协议合同（未知身份/预算不符/伪造载荷负例）。
2. 迁移：隔离库 up/down + `cognitive-protocol-migration.sql` 自检。
3. Postgres 集成：research-cognitive（扩展 per-protocol）、survey SJT/认知混合回归（受影响闭包）。
4. 前端：Editor 选择、SimonTask、trial-envelope、SurveyMeasurement extension。
5. 双入口分层取证：发布冻结→START/恢复→FINAL→报告/导出→权限负例（真实隔离库）；单元测试或源码注册不等于浏览器与双端通过。
6. CI 前按台账 CI-001~020 自查适用项；同一目标两轮不收敛停全量。

## 6. 预计时间（等效工作日）

| 项 | 估时 |
| --- | --- |
| 平台泛化（注册表/冻结链/FINAL/迁移） | 1.5–2 |
| Simon 定向重接入+generated 重生（依赖内容线包就绪） | 0.5–1 |
| 反馈/报告+阈值证据等级 | 1 |
| Training 桥接+矩阵 | 0.5–1 |
| 双入口分层验收 | 0.5–1 |
| 合计 | 4–6（与六项必修穿插，P0 优先） |

## 7. 认知内容线接入契约（content/dot-cognitive-library-20261026）

内容线只交付任务包，不改 Survey 共享层、迁移、编辑器/Preview。每任务需提供：

1. `package.ts` 清单：`testType`、`engineVersion`、`configVersion`、`scoringVersion`、config zod schema、种子化 sequence 生成器、scorer、被试呈现规格、科学元数据（来源记录+适配差异）、seeds、golden 用例。
2. 命名如实："基于某范式/文献的本项目自研版本"，记录来源与差异；不冒称原作者标准化测验等同复刻。
3. 版本纪律：config/scoring 任何变化→新版本号+golden 重生；身份不可变，不静默重绑。
4. 自研路径合法：文献→协议与参数→自行编码/生成刺激→技术验证→初步参照规则→后续真实数据校准；无大样本常模不构成登记门槛，也不自动获得诊断/高风险筛选资格。
5. 平台侧承诺：平台只经显式注册放行；注册即经 publication-gate readiness；内容线包外的任何文件平台线不改动。

# ANT/PANT：产品描述性报告接入准备 · 2026-10-26

稳定ID `attention-ant-pebl`。实施基线 `86adea091270134b5197fb81b76649007596b8f3`。本次依[研发总表页首最新原则](https://app.notion.com/p/405d27635a3881b2a2d3fecce26d7cb3)的用户授权，完善既有已批准候选的报告消费；不启动新测验、额外时序研究、预检、回算或原件下载分析，不改共享core、注册、API、DB、COS，不commit/push/CI。

## 精确核验与最小计划

1. 现有ANT scorer不因无常模或缺物理曝光精度证明关闭正常报告：`references=[]`、`referenceEligible=false`，正常完成本就可以interpretable。
2. **未发现一次约16.7ms偏差被20ms规则拒绝的问题**：各阶段用本阶段真实起点计算时长；相邻trial只比较两个真实起点，不按整个block累计理想起点。约16.7≤20，原规则已容纳。故没有调整20ms、engine、config、quality规则，也没有把用户决定擅自换成50ms通用数值。
3. 实际缺口是native报告定义：原`report.userMetrics=[]`，分条件准确率/正确RT/差值仅在research_only嵌套对象里；直接通用native投影只给总正确比例和技术次数。现有定制卡片还未呈现侧翼条件的正确RT及分母。
4. 最小改动是给已有同源、已门控结果增加明确native标量指标和分母，并让中英报告可展开查看侧翼条件；不重新扫描原件或从COS拉取重算。

修改native指标/投影与Task专属报告 → 可能漏显示分母、错误暴露受限条件或把signed差值裁零 → 云端单worker仅跑新增报告合同和新报告UI → 旧capture、时序流程、后端完整测验套件和完整浏览器证据保持不动 → 实际后端7项、前端4项，各约1秒内；改动backend三根类型闭包约3秒。主线统一做前端入口类型闭包，本agent不重复。

## 已实施的具体合同

- cue四种条件与flanker三种条件分别提供正确比例、正确首响应算术平均用时（ms）、有效次数、计划次数、正确次数及实际用于RT的正确回应次数。
- 三个有符号差值保留：`none−double`、`central−spatial_valid`、`incongruent−congruent`；公开前/后项各自正确回应分母，不生成综合能力分或常模排名。
- 新native标量由**现有`projectAntReport`的同源gate**映射，不设第二套scorer。原始按touch/pointer/keyboard分层的RT汇总保留research_only；混用输入时RT和差值仍隐藏，准确率可按原规则描述。
- `AntReportCard`只接host已绑定context/configHash/protocolSignature的投影和quality flags；新增侧翼条件放在一个可展开文字/表格层。中英显示真实次数、正确平均用时与signed差值；没有新增图、评级、诊断或录用推断。
- 缺答、缺阶段、中断、非法seed/序列、时钟不一致、版本不兼容、实际输入混用等原有质量及身份检查不变。错误与完整超时仍进入准确率分母；正确RT不含错误/超时，未定义均值仍null，真实0和负数保留。
- 本轮没有新增采集、定时器、每帧网络请求、设备白名单或物理时序证明。屏幕/观看距离校准是已批准刺激几何的host端口要求，不能混称为必须获得科研物理曝光精度证书。

## 版本与旧冻结组合

| 实际定义 | 旧值 | 本次 | 理由 |
|---|---|---|---|
| engineVersion | 1.0.0 | 1.0.0 | runner、呈现、输入与序列没有改变 |
| configVersion / config内容 | 1.0.0 | 1.0.0 | 288/48、练习24、100/400/1700/4000ms、中性变式及20ms均不变 |
| scoringVersion | 1.0.0 | **1.1.0** | 计分结果数据契约新增可公开标量；算法/纳入/排除不变 |
| metricDefinitionVersion | 1.0.0 | **1.1.0** | 新增native条件指标/分母定义与可见度 |
| qualityDefinitionVersion | 1.0.0 | 1.0.0 | 未改变质量规则、阈值与三态判定 |
| reportDefinitionVersion | 1.0.0 | **1.1.0** | native报告新增可消费指标，定制卡片新增侧翼记录展开层 |
| protocol.version | 1.0.0 | 1.0.0 | 没有新刺激或单次协议变式 |
| protocol.key | ant/1.0.0/1.0.0 | **ant/1.0.0/1.1.0** | 沿当前engine/scorer组合命名；protocolSignature据此不同 |
| RNG | ant-fnv1a-mulberry32-v1 | 同旧值 | 未重新随机化或改变生成规则 |

新`configHash`可以与旧版相同，这是配置内容没有变的真实结果；不能据此混用scorer/protocol tuple。新scorer明确拒绝旧`scoringVersion=1.0.0`或旧protocolSignature，不把旧冻结结果拿到新算法下静默重算。旧源码、报告、设计、截图和原始失败证据保留在历史提交/原目录；本次只新增本目录原件，未重写历史。

四个profile×neutralVariant实际新冻结示例见`frozen-tuples.json`。metric/quality身份仍为候选定义metadata，真实SessionConfigSnapshot没有凭空新增normVersion或总版本字段；报告/参照/几何的完整施测冻结由实际平台消费者继续接线，不宣称已持久化完毕。

## 定向证据

- `backend-report.json`：7项通过，覆盖research/experience正常无常模报告、原20ms容差内的16.7ms正常回调记录、真实中断/不足、错误与超时分母、混合输入和非法truth、native signed值与旧tuple拒绝。这里的一帧例只是现有报告gate回归，**不是新时序研究、采集或硬件证明**。
- `frontend-report.json`：4项通过，覆盖中/英文侧翼记录、真实分母/负值/0、limited/invalid与mixed gate；没有重跑旧capture或完整浏览器流程。
- `backend-types.json`：按实际backend tsconfig，仅改动protocol/scorer/package三入口类型闭包退出0。前端类型由主线统一消费，不重复。
- `ant-content.cjs --check`退出0，纯生成协议/报告投影与后端源码SHA一致，没有将backend scorer/crypto引入浏览器。
- 精确source hash、命令、退出与复用边界见`evidence.json`；变更原件见`change.diff`。开发自查不是独立审计、正式CI、发布、常模资格或上线证明。

## 准备好了什么，尚未接通什么

已完成：ANT专属scorer结果契约、native指标/报告定义、定制中英条件报告及定向原件。没有新增测验内容、素材或授权范围；继续沿已有自研几何/协议路径和原GPL/字体/素材分轴边界。

实际`validateTaskDefinition(antDefinition)`仍仅返回 `profiles: standard profile is required`。这是平台准入依赖，不以添加第三个standard别名或假0–100分绕过。详见`admission-dependencies.json`。全局native注册、Survey/Training等四入口消费、真实报告冻结/导出、API、DB核心保存和COS完整归档仍未由本项接通；标签后台持久化/搜索与设备分层也不因本报告合同完成而变成已接入。

主线负责共享平台与最终提交；本agent只交付可审阅的ANT专属差异和证据。无适用常模、中文/英文理解与真实设备效度的限制如实保留，但不是本轮正常描述性反馈的全局关闭理由。

## 生成器导入修复（原类型失败保留）

主线真实frontend类型闭包发现生成的report.ts使用FLANKERS但生成器未导入，连带Card推断错误。只在ant-content.cjs补FLANKERS导入并重新生成，未手改生成物。此前后端7项调用的是后端投影；前端4项仅消费预制投影，Card对函数为type-only导入，因此没有执行生成出的函数；--check只能证明与生成器输出一致。新增projection.product-policy.test.ts直接调用生成出的projectAntReport并执行flankerRows，1项定向通过，其他已合格项不复跑。原/tmp类型失败未修改，精确新旧hash与回归原件见generator-fix-evidence.json；该文件只覆盖旧evidence中generator/generated report的最终source绑定。前端类型续验由主线仅对ANT入口执行。

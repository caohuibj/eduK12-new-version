# 点数判断：本次描述性反馈产品决策增量

基线 `86adea091270134b5197fb81b76649007596b8f3`。执行依据为 [Notion 页首 2026-10-26 09:20 UTC 最新用户授权](https://app.notion.com/p/405d27635a3881b2a2d3fecce26d7cb3)，本次已读取。页首优先于旧计时提案。本目录是开发自查，未代替独立审计、正式门禁或真实平台接入。

**改动**：撤下无条件 `protocolValidationPending/individualInterpretationBlocked → invalid`。物理曝光尚未验证及偶发多一帧本身不关闭本次描述性反馈；没有加入任何预检、刷新率白名单、计时容差、额外等待或 COS 回算。`capture.ts`、`display.ts`、`persistence.ts`、CSS、50 ms 策略、3 练习、100/25 正式、1–15 滑杆和 seed 生成算法未变。旧 25 条浏览器 raw 和 86adea 计时设计均保留，没有重判或重新执行。

| 实际记录 | 状态与用户可见内容 |
| --- | --- |
| 正式数量完整、均可纳入 | `interpretable`：判断正确次数／纳入次数，偏多／偏少次数；只描述本轮 |
| 部分记录可纳入，但尚未完成或有真实排除 | `limited`：同样给真实次数，明确计划数、记录数、纳入数与排除数，并称“部分记录” |
| 空记录、全部未答或全部不可纳入 | `invalid`：无表现结论、无假 0 分；指标缺失仍为 null |
| 非有限数、非法答案／顺序／seed／冻结版本等 | 原严格 schema／scorer 拒绝，不能冒充正常结果；UI 对不兼容报告只显示不可用 |

原技术事实排除保留：真实未答／超时／早按、中断、缺阶段时钟、采集不完整或 overflow、缺校准／刺激引用、无法按原时钟恢复。它们不是物理 50 ms 门槛；本轮没有新增数值阈值，也没有将任意严重故障定义为正常。未完成并不变成“已完成”。`interpretable` 在此仅指获准本轮描述，不指效度／诊断／常模资格。

报告无常模、同龄排名、能力等级或诊断。偏多／偏少是相对于每次真实目标点数的方向计数；平均有符号偏差保留负值；操作 RT 不解释为感知速度。参与者报告仅经同源纯 projection 显示 `summary`，不读取内部 raw metrics 或 binding。没有新增图片／图表。

## 真实字段和冻结兼容

| 依赖 | 旧冻结 | 新冻结 | 原因 |
| --- | --- | --- | --- |
| engineVersion | 0.1.0 | **0.1.0** | 呈现和输入不变 |
| protocol key/version | enumeration/0.1.0/0.1.0；0.1.0 | **不变** | 原阶段、时长和随机化协议不变 |
| scoringVersion | 0.1.0 | **0.2.0** | 新方向计数、三态质量和公开结果语义 |
| configVersion | 0.1.0 | **0.2.0** | 冻结新解释策略和下列独立依赖 |
| metricDefinitionVersion | 原候选无显式配置依赖 | **0.2.0** | 新增正确／偏多／偏少计数和公开口径 |
| qualityDefinitionVersion | 原候选无显式配置依赖 | **0.2.0** | 取消无条件 invalid，按真实有效记录三态 |
| reportDefinitionVersion / report.version | report.version 0.1.0 | **0.2.0** | 中英简短本轮反馈 |
| presentationVersion | 原候选未显式绑定 | **0.1.0** | 复用既有视觉布局，不改刺激 |
| randomizationAlgorithmVersion | enumeration-fnv1a-utf16-mulberry32-fisher-yates-v1 | **不变** | 不改变序列或随机流 |

本候选将这些依赖放在**已有 config snapshot 载荷**并纳入真实 `configHash`；没有新增共享 DB/schema 字段、总版本或 normVersion。`session_descriptive_v1` 是产品解释策略 key，不是科研标准。新 scorer 精确核验完整 session config/hash、protocolSignature、版本、seed 和原始记录。即时 scorer 与已存快照使用独立报告入口，均拒绝 0.1.0 与 0.2.0 混用；旧结果不就地改写、不自动迁移或重新分析。旧结果重放仍需其旧提交和旧定义；当前候选未同时安装旧 scorer。

`reportBinding` 是内部结果依赖载荷，含候选／engine／scoring／config 身份、完整 config、seed、真实 configHash 和 protocolSignature。projection 校验新版绑定、配置、计数／分母／按数量汇总和质量状态一致；匹配当前 UI 的 config/profile/seed。即时入口要求 scorer 的 audit；独立 `projectStoredEnumerationReport` 接受实际 v2 `CognitiveResultSnapshot` 全字段结构（无 audit），先核外层 testType/engine/scoring/config/profile/protocolSignature 与内部绑定一致，再核计数／质量；不补造 audit。后端定向检查实际调用现有 snapshot schema。UI 提供 `storedResult` 或即时 `result` 二者之一，混合来源拒绝。它不认证任意外部 JSON，也不替代平台对冻结结果的权限／来源校验。

## 改动消费者与执行清单

- backend 独占 `server-version/backend/src/modules/cognitive/content-candidates/enumeration/`：protocol/schema 冻结依赖；scorer 三态及计数；新增纯 report.ts；package 原生 report 元数据；metadata 最新产品授权。
- frontend 独占 `server-version/frontend/src/modules/cognitive/tasks/enumeration/`：新增 EnumerationReport.tsx；EnumerationTask 仅替换报告展示和限制文案；generated protocol/report 由 `server-version/scripts/cognitive/enumeration-content.cjs` 同源生成，不手抄 scorer。新 `enumeration-report.test.tsx` 只检查报告，不产生新作答。
- backend 原单文件测试 `server-version/backend/src/__tests__/cognitive/enumeration-candidate.test.ts`：更新变更后的断言并新增定向产品策略检查。旧 frontend 流程测试仅更新缺 host result 的标题，不执行旧完整流程。
- 可能故障 → 必需检查：错误分母／假零／错误三态 → 定向 backend/UI；新旧版本混用 → 新旧和混合配置拒绝；前后端投影漂移 → 生成脚本 `--check`；元数据 headline 不显示 → 精确 metadata 检查。主要执行位置均为云端。预算仅数秒单 worker，不安装、不跑 CI／浏览器／全量构建。

## 实际检查原件

- `backend-affected.json`／`.check.json`：11 PASS、17 未运行，exit 0；包含正常两 profile、本轮 66.6 ms **合成**四帧记录、真实零正确、负偏差、未答／中断／部分、冻结重放／旧混合版本拒绝及投影 gate。不使用旧浏览器原件重判。
- 随后修正 package headline/detail 元数据映射及中文标签，只复验受影响 identity/metadata 一项：`backend-metadata-final.json`，1 PASS、27 未运行。首次 11 项中的该项由此新版证据替代，其余 10 项输入语义未变；不把合计执行次数称新独立检查数量。
- `frontend-report.json`：7 PASS、exit 0，中英完整／部分、实际零正确、缺失／旧版本／错误 seed／伪造状态不可披露；jsdom 合成数据，不是新截图或设备实验。
- 新增 stored adapter 后，`backend-stored-adapter.json`／`frontend-stored-adapter.json` 各 1 PASS、exit 0，仅补本次新适配，未重跑旧 11／7 项。包括实际已存 schema 无 audit、旧外层版本／协议／profile 拒绝及 UI 混合来源隐藏。backend 本轮 12 个不同选中用例（其中 metadata 一项有修订后定向替代），UI 本轮 8 个不同用例。
- `projection-final.check.json`：最初生成检查 exit 0；新增 stored adapter 后仅重做受影响生成一致性检查，`projection-stored-final.check.json` exit 0；此前成功保留各自输入身份。
- 原 stdout/stderr、实际命令／耗时／前后源码 SHA256 均在对应 `.check.json`。本轮无测试失败，不改写历史失败。
- 实际 tsconfig 变更入口类型检查由主线统一执行，本子 agent 未重复；结果尚待主线提供。

旧 seed/capture、同 realm 算术、保存流、3+25 全流程、浏览器时序和截图未重复；旧证据只支持各自原始输入，不冒充此次新报告的验证。

## 未接通与许可边界

候选仍未原生注册、正式入库或上线。真实四入口 host、server session/attempt/epoch 映射、API FINAL、DB 冻结结果、COS 私有归档／引用／导出未接通。当前 `result` prop 由 host 提供权威结果；没有结果时不靠客户端从 raw 算分填空。保存确认仍依原 host ACK，不更改为假成功。已提供真实 `CognitiveResultSnapshot` 的独立纯结构报告 adapter，不要求或伪造 audit；真实 API 的授权读取、冻结来源及 prop 接线尚未实现，不声称已有生产 mapper。

原创 TypeScript／React 逻辑，基于既有文献方法自研；未复制上游 noise.png、字体／题库／图片或运行器，无新增依赖。原上游代码 MIT 与素材权利审查仍分轴。未取得真实手机／平板／桌面硬件、不同浏览器、物理曝光、亮度／视角、遮罩统计、中文理解或人群效度证据；这不再单独阻止本次获准描述性反馈。

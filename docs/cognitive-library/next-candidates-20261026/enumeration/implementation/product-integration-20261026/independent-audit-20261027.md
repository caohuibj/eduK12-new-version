# 点数判断 a704d1b5 候选：主代理独立审核（第 1 轮）

状态：`INDEPENDENT_AUDIT_ROUND_1_COMPLETE_WITH_FINDINGS`。本文件是新的根对话主代理亲自读源码后的独立审核记录，不是开发者自述摘要的复述，也不是上线、验收或发布门禁结论。

## 1. 审核对象与边界

- 分支 `cognitive-next-three-core-20261026`，HEAD `a704d1b52a6ac28424ce88a1b8e165048427d0fd`，tree `2a6c120b946a31c6fdb827d29633b06a4fa9f4cd`，工作树干净。
- `evidence.json` 登记的 23 个源码 SHA-256 已在本轮重算：23 匹配、0 差异、0 缺失。当前树与交接快照一致，未见交接后被改写的源码。
- 只读审核。本轮没有改产品源码、没有改 fixture、没有重跑上一轮浏览器旅程、没有触发 CI、没有合并 PR356、没有部署。

## 2. 本轮实际执行位置（与上一轮不同，必须分开记）

- 上一轮：云端 Debian 13.6，`/workspace/eduK12-new-version`，cgroup 4 核 / 16 GiB。
- 本轮：macOS 27.0（darwin arm64），8 逻辑 CPU、8 GiB 内存上限、工作目录 `/Users/Qiang/WorkBuddy/2026-10-27-00-56-04`，仓库为从远端重新克隆的干净副本（7652 文件）。
- 因此本轮的类型检查、测试与浏览器证据都属于**本机执行**，不继承上一轮的“执行位置均云端”表述；上一轮已合格的云端证据在输入未变时才可复用。

## 3. 远端事实（本轮重新读取，非引用快照）

- `main`：`ff8471e529e7b3c56e1e20f17d1e2581040fc896`（2026-10-25T19:41:00Z，Merge PR #355）。
- PR #356：`open` / `draft`，head 已由上轮快照的 `cb0181a045e3` 前移为 `0f044cbf0fc543eb17eda5fe1913c1ddc2347c76`（`fix/runtime-time-and-validation-20261025`），base `main`，88 commits、383 文件、+263561/−2487，`mergeable_state=blocked`。
- 增量部分：`feb5f12d` 训练冻结委派测试、`5f24cf49` 本地验证证据冻结、`59df55a2` 证据原件交接、`0f044cbf` 补齐已复核证据缺口。均带 `[skip ci]`。
- 结论：旧快照里的 PR356 head 已过期；本轮不得以 `cb0181a0` 描述 PR356 现状，也不得假定其 CI 状态。

## 4. 独立审核确认成立的部分

1. 精确元组准入只放行 authenticated：`task-resource.ts:73-81` 仅接受 MOT 与点数 `0.2.0/0.2.0/0.3.0`，其余 native 身份与非 authenticated 路径一律拒绝。
2. 归档幂等绑定业务身份而非 assetId：`raw-archive.service.ts:101` 的 `field` 由 `authorityHash + rawSha256 + logicalHash` 组成；`existingFinal` 按 `entityId=rawSubmissionId` 取引用，同 field 幂等返回、不同 field 报 `ARCHIVE_CONFLICT`。这正面回应了“AssetReference 唯一键含 assetId”的风险。
3. TOCTOU 防护真实存在：`locked()` 在事务内重读 authority 并比对 `guard`（session/raw/result/admission/密文全量），变化即 409。
4. 网络上传不占长事务：`storeAsset` 与加密在 `locked` 之外执行（`:231-236`），最终只做短事务绑定。
5. 归档范围收窄：`loadAuthority` 拒绝 composite/accessToken/public 会话（`:57-58`），准入快照要求 `parent===null`。
6. seed 只建 DRAFT 基配置 + profile patch，不自动发布、不创建账号或授权（`seeds/native-cognitive.ts:11-20`）。
7. 报告 gate 在候选投影中是“从计数重算”的，伪造 state 无法放行指标（`content-candidates/enumeration/report.ts:81-92`）。
8. 旧 null-recipe 元组未被伪造：`enumerationConfigForIdentity` 按 identity 分支返回不同 config（`protocol.ts:88-90`）。

## 5. 本轮发现（按严重度）

### F1 报告四个指标共用同一句占位说明（确认，用户可见）

- 现象：真实浏览器报告里“判断正确次数 / 纳入作答次数 / 点数偏多次数 / 点数偏少次数”四项的说明文字完全相同，都是
  “该指标用于描述本次任务中的一个具体表现维度，请结合任务说明与其他指标共同阅读。”
- 链路：`single-task-report.ts:87` 只有在 `presentation`（`CognitiveParticipantPresentationV1`）存在时才写入 `explanation`；点数判断没有任何 participant presentation（`generated/presentation.ts` 只引入 `tasks/*` 下的既有任务，`grep enumeration` = 0 命中）；前端 `CognitiveV2ReportCard.tsx:26` 取不到 `explanation` 且 `LEGACY_EXPLANATIONS` 无该 key，落到兜底句。
- 影响：第三层（报告文字/呈现）质量缺陷，不涉及刺激、时序、输入或计分。与“报告要具体、普通用户愿意看”的要求直接冲突。
- 修法边界：需要给点数判断补参与者文案（标签 + 每指标一句具体解释），并决定 `presentationVersion` 是否从 `0.1.0` 前进。因为该版本号同时写在冻结 config 里（`protocol.ts:65,81`），改它会使 configHash 变化、需要重新 seed 与重新冻结；只加表现层文案而不动 config 则要说明“沿用 0.1.0 但内容已变”是否可接受。此项必须先定版本策略再动手，不宜静默改。

### F2 详细指标 `byQuantity` 在报告里显示为空（确认，代码级；未看到展开截图）

- `byQuantity` 定义为 `unit:'map'` 且 `valueType:'array'`（`package.ts:23`），运行时形状是 5 行对象数组（`scorer.ts:92`）。
- `formatMetric` 的 map 分支先判 `Array.isArray(value)` 即返回 `'—'`（`single-task-report.ts:64-70`），所以“各点数的作答记录”在展开层只是一条横杠。
- 影响：第三层呈现缺陷；数据本身在冻结 metrics 里完好，不是丢数据。
- 注意：本轮未展开 200% 截图核对这一行，故仅以代码路径确认，未列为视觉证据。

### F3 候选专属 gate 未接生产（事实记录，不构成漏洞）

- `projectEnumerationReport` / `projectStoredEnumerationReport` 的生产消费方为 0，仅测试引用；生产走 `v2/report.ts` 的通用构建器 + 服务端 scorer 的 quality。
- 判定：服务端 scorer 由已提交试次重算，客户端无法伪造 metrics，因此通用 gate 仍成立；但候选里那层更严格的“计数重算”保护目前只是测试资产，不应被描述成线上防伪门禁。

### F4 归档路由用 payload 形状判别任务类型（稳健性提示）

- `raw-archive.service.ts:174` 用 `'artifact' in rawPayload` 判定为点数原件，其余走 MOT parser。
- 今天两种 payload 形状不冲突，可正常工作；但这是形状嗅探而非显式 kind/version 判别，未来 MOT 原件若新增 `artifact` 字段会误路由。建议后续加显式判别，不建议本轮改（会动归档协议）。

### F5 练习次数在 seal 处硬编码（耦合提示）

- `native-port.ts:66` 的 `completeRecords` 写死 `[0,1,2]` 三个练习且要求 `completion==='confirmed'`。
- 当前 config 固定 3 次练习，不构成现行 bug；但练习次数一旦变化，失败表现是“本次作答尚未完成”而非明确配置错误，排查成本高。

## 6. 本轮明确未做（不得据此推断已通过）

- 外部 COS 真实上传；完整产品 App 与 `/api/auth/csrf`（上一轮 trace 中确为 404）。
- 物理手机/平板/Safari、真实触控与物理呈现时序。
- 产品英文入口（原件 `language` 固定 `'zh'`）。
- research 100 次真实浏览器旅程；四入口完整一致性。
- 标签后台持久化/过滤/搜索。
- 完整 CI、合并、部署、正式激活。
- 上一轮已合格的云端证据未重跑，也未在本轮重新签发。

## 7. 建议的最小下一步（按优先级）

- P0：定 `presentationVersion` 策略后补点数参与者文案，消除 F1 的占位句（第三层，单独小步，附前后截图）。
- P1：修 F2 的详细指标呈现（数组型 map 的专用渲染），与 F1 分开提交，避免文案与格式化混在一个 diff。
- P2：F5 把练习次数改为从冻结 config 读取，失败信息区分“配置不符”与“未完成”。
- P3：F4 归档显式判别，需与归档协议变更一起评估，本轮不动。

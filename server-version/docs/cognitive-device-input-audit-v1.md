# Cognitive Device & Input Provenance Audit v1（COG-P2 Commit 2.1）

- 日期：2026-09-07
- 基线：main @ `6033384`（COG-P1 PR #60 merge 后）；分支 `feat/cognitive-device-input-provenance-v1`
- 性质：**source audit + specification only**。本 commit 不修改任何运行代码（frontend runner / FINAL submit / trial schema / scorer / Prisma / payload / Reference / COS 全部不动）。
- 路线声明：PR #54 及旧 performance optimization lane 已从 Cognitive Library 本轮计划完全移出；本审计与该 lane 无关。
- 核心原则：**RECORD, DO NOT CORRECT** —— 本轮不实现任何 touch RT 校正、device 校正、browser timing 补偿、device-specific norm 或 weighting；这些属于未来有真实数据后再判断的问题。
- 事实来源：frontend `server-version/frontend/src/modules/cognitive/`（tasks/、core/）、backend `schemas/*.trial.ts`、`scoring/trailmaking.v1.ts`、`v2/registry.ts`、`v2/quality.ts`。全部结论逐行核对源码得出。

---

## 1. 共享数据链路事实（所有任务的公共背景）

1. **TrialEnvelope 没有任何 device/input 字段**（`core/trial-envelope.ts:3-13`）：仅 `schemaVersion/trialIndex/phase/startedAtPerfMs/endedAtPerfMs/durationMs/flags{timeout,premature}/qualityEvents[]/payload`。
2. 输入信息唯一可能的位置是不透明 `payload: Record<string, unknown>`（任务自报，透传存储）。
3. `qualityEvents` 实际只会产生 `visibility_lost`（由 `payload.interrupted===true` 推导）；`window_blur/resume/runner_restart` 枚举值存在但从未被生产。
4. FINAL 链：任务 local payload →（有 protocolSignature 时）`wrapCognitiveTrial` 包 envelope → IndexedDB draft → `submitFinal({trials: payload[]})` → backend `unified-raw-submission`（strict envelope 数组）→ trial schema（strict）校验。**链路全程无 device/viewport/UA 附加点。**
5. **没有共享输入 helper**：`tasks/shared/` 只有 PRNG/词库/practice 常量；唯一 device/pointer 代码是 TrailmakingTask 内部的 `deviceClassOf()`/`pointerTypeOf()`（未共享）。
6. 所有任务监听 `visibilitychange` 记录 `interrupted` —— 这是文档状态标志，不是输入 provenance。

## 2. accepted vs captured（指令 §6 的核心区分）

**UI 接受某种输入 ≠ provenance 已存在。** 全库结论：

| 任务 | acceptedInputModes | capturedInputModes | 记录层级 |
|---|---|---|---|
| reaction | mouse click / touch tap / keyboard（任意键） | **collapsed**：`inputMode: 'pointer'\|'keyboard'`（'touch' 从未产生；miss 超时硬编码 'pointer'） | trial（自报，不可靠） |
| trailmaking | mouse / touch / pen（onPointerDown）+ keyboard（Enter/Space） | `pointerType`（per-attempt，真实来自 event.pointerType）+ `deviceClass`（per-trial 启发式） | attempt + trial |
| cpt | click（任意处）+ keyboard（聚焦 div 上任意键） | **none** | nowhere |
| nback | click（任意处）+ keyboard（聚焦 div 上任意键） | **none** | nowhere |
| stroop | click 4 色键 + keyboard `1-4`（window） | **none** | nowhere |
| lexicaldecision | click 2 键 + keyboard `1/W/←`、`2/N/→`（window） | **none** | nowhere |
| emotionrecognition | click 6 键 + keyboard `1-6`（window） | **none** | nowhere |
| memory | 屏幕数字键盘 click + 物理键盘 `0-9/Backspace/Enter`（window） | **none**（两路汇入同一 `handleDigit`） | nowhere |
| gonogo / sst / flanker / taskswitch / patterncompare / cardsort / mentalrotation / reversallearning / bart / matrix | click（各自按钮） | **none** | nowhere |
| digitbackward | 屏幕键盘 click **only**（物理键盘完全不支持） | **none** | nowhere |
| wordlist | 自由文本 `<input>`（物理/IME/软件键盘/手写/听写，全部不可区分） | **none** | nowhere |
| corsi | 方块 click（无拖拽/键盘） | **none** | nowhere |
| picturesequence | 卡片 click 选择/取消（无拖拽/键盘） | **none** | nowhere |
| tower | peg click-click（无拖拽/键盘；per-move `atMs` 有计时） | **none**（有动作计时无 modality） | nowhere |
| pairedassociate | 位置 click | **none** | nowhere |

结论：**24 任务中 22 个 zero provenance**；reaction 是"有字段但 collapsed"；trailmaking 是"有真实 per-attempt pointerType + 不可靠 deviceClass"。

## 3. Reaction：exact finding（KNOWN PROVENANCE GAP）

源码路径（`tasks/reaction/ReactionTask.tsx`）：

- 唯一应答入口是 React `onClick={() => handleFormalInput('pointer')}`（:297）—— **事件对象被丢弃**，`'pointer'` 是硬编码字符串字面量。
- keyboard：window 级 `keydown`（:159-164），**不滤波任意键**，`onKey = () => handleFormalInput('keyboard')` 同样硬编码。
- 判定：`event.pointerType` / `TouchEvent` / `pointerdown` 区分逻辑**完全不存在**。Mouse click 与 touch tap 在 DOM 层就是同一个合成 click → **complete collapse，结构性发生**。
- `ReactionTrialPayload['inputMode'] = 'pointer'|'touch'|'keyboard'`（types.ts:242）的 `'touch'` 成员**从未被任何代码产生**。
- 额外发现：**miss/超时路径硬编码 `submit(null, 'pointer')`（:98-100）** —— 未发生任何输入的试次也记录 `'pointer'`，属伪造值。
- practice 阶段只有 click、不持久化、无键盘。
- payload 恰为 5 键（测试断言）：`foreperiodMs/inputMode/interrupted/prematureCount/rtMs`。

**标记：KNOWN PROVENANCE GAP（Gap B: collapsed modality + miss 伪造 pointer）。Commit 2.1 不修。** 前端已有正确机制可复用：Trailmaking 的 `onPointerDown` + `event.pointerType`（ReactionTask 未使用）。

## 4. Trail Making：exact finding

### 4.1 Device 判定（`TrailmakingTask.tsx:11-16`）

```ts
if (window.innerWidth < 600) return 'phone'
if (matchMedia('(pointer: coarse)').matches) return 'tablet'
return 'desktop'
```

- **无 UA、无 maxTouchPoints、无 screen 尺寸、无 dpr**；mount 时 `useMemo` 求值一次并**冻结整个 session**（无 resize/rotate 监听）。
- 误分类风险（Gap D）：**tablet+外接鼠标 → 'desktop'**（主指针变 fine）；**横屏手机+鼠标（≥600px）→ 'desktop'**；**窄窗口/分屏/缩放 → 'phone'**（viewport 不是屏幕）；iPad+触控板 保持 'tablet' 但 fine-pointer使用不可见；触摸屏笔记本通常 'desktop'（正确）但平板模式可能 'tablet'。`touch laptop → tablet` 类误分类**存在**。

### 4.2 Input 判定（:18-19, :33, :34-39）

- 来自 **`onPointerDown` 的 `event.pointerType`**（非 click），合法值 `mouse|touch|pen`，其余 → `'unknown'`（并触发 deviceInfoIncomplete）。
- `'keyboard'` **不是 PointerEvent 合法值** —— 由独立 `onKeyDown`（Enter/Space）路径硬编码注入；schema 的 `keyboard` 枚举成员由此而来。

### 4.3 数据重复（Gap C）

- `deviceClass` 是 session 级事实（mount 求值一次），但被**写进每一个 trial payload**（:105-109），backend `schemas/trailmaking.trial.ts` 亦按 per-trial strict 字段定义。**无 session 级 device record 存在**（backend service 层 grep 无 deviceClass/userAgent/screenWidth）。
- `pointerType` 为 per-attempt（`attempts[]{targetId,atMs,pointerType}`，:148-152）—— 这是合理的 per-response 粒度。
- practice attempts 丢弃 pointerType，不记录。

### 4.4 Scorer coupling（Gap E）

- `scoring/trailmaking.v1.ts:22-39` 收集 `pointerTypes`/`deviceClasses` 集合；`:72-73` 派生 `deviceInfoIncomplete`（任一 unknown / 无 pointerTypes）与 `mixedPointerType`（>1 种）。
- **metrics 与 score 完全不受影响**（:82-93 只用 `attempts[].atMs` 与正确性）；v1 中两 flag 也不参与 `interpretable` 表达式（:95），纯警告。
- **但 v2 命名推断**（`v2/registry.ts:20-24`）把不匹配 `/invalid|corrupt|malformed/` 且非 `interpretable` 的 flag 全部落入 **`'limited'` effect** → `deriveQualityState` 将整个 result 的 quality state 降为 **limited**（`v2/quality.ts:9-21`）。
- **结论（仅提出，不改 scorer）**：device provenance 缺失或混合在科学上是 *provenance warning*，不是 cognitive interpretability 下降。v2 当前把它当 quality 降级处理过重。建议后续 commit 将这两个 key 的 effect 显式声明为 `'none'`（provenance warning）或引入非降级的 warning 语义 —— 归入 Commit 2.3/2.4 议题，本 commit 不动。

## 5. 混合模态 RT 任务 exact finding（CPT 及同类）

- **CPT**（`CptTask.tsx:154`）：整页 div `onClick` + `onKeyDown`（tabIndex=0），**任意键**，practice/formal 均激活。payload `{blockIndex, stimulus, isTarget, responded, rtMs, interrupted}` —— 无 modality。学生用鼠标还是键盘作答**完全不可知**。
- **N-Back**：同 CPT 模式（`NbackTask.tsx:192`，任意键）。
- **Stroop**：click 4 色 + window `1-4`（`StroopTask.tsx:139,243`）；`preventDefault`；listener 全 phase 注册但仅在 stimulus 窗口计响应。
- **Lexical Decision**：click 2 键 + window `1/W/←`、`2/N/→`（`LexicaldecisionTask.tsx:139-148,222-223`）。
- **Emotion Recognition**：click 6 键 + window `1-6`（`EmotionrecognitionTask.tsx:143-150,233`）。
- 上述 5 个任务 = **Gap A + Gap B 叠加**：多模态接受 + 零记录 + click/keyboard 响应汇入同一 `response` 字段不可区分。
- 纯 click 任务（gonogo/sst/flanker/taskswitch/patterncompare/cardsort/mentalrotation/matrix/reversallearning/bart）：至少 modality 空间只有 click-like，但 **mouse vs touch 仍不可区分**（click 合成）→ Gap B 的弱形式。
- 顺带发现（非 modality，供后续修复参考）：**BART 超时硬编码 `interrupted:true`**（`BartTask.tsx:100-102`，不读 visibility flag）；**picturesequence 不活动超时伪造 `responseDurationMs: inactivityGuardMs`**（`PicturesequenceTask.tsx:101`）。

## 6. 输入型任务 exact finding（Gap F: typing confound）

| 任务 | 输入现实 | 结论 |
|---|---|---|
| wordlist | 原生 `<input>` 自由文本：物理键盘 / IME / 手机软件键盘 / 手写 / 听写全部接受且**不可区分**；仅整轮 `responseDurationMs`，无逐词/逐键时序 | **全库最大未测输入面**。输入方式直接改变可完成回忆量 |
| memory | 屏幕数字键盘 click + window 物理键 `0-9/Backspace/Enter` 双路汇入 `handleDigit`，无 modality 字段；`responseDurationMs` 总时长且**不活动延长不重置计时起点**（空转时间计入） | Gap B + Gap F；时长指标被输入方式与 guard 污染 |
| digitbackward | **仅屏幕键盘 click**，物理键盘完全不支持 | 输入方式恒定为触屏式选择，桌面用户被迫点击；无 provenance |
| corsi | 方块 click；**无逐 tap 延迟**（对比 trailmaking 有 per-attempt atMs） | 只有点击总量时长，无法分析序列节奏 |
| picturesequence | 卡片 click 选择/取消排序 | 无 modality；timeout 伪造时长（上述） |
| tower | peg click-click；**per-move `atMs` 有记录**（Part 2 唯一） | 有动作计时、无指针/设备 provenance |

## 7. Device 与 Input 两个独立轴（指令 §7）

审计确认 `mobile=touch / desktop=mouse` 模型不成立。真实组合（当前数据全部不可见）：touchscreen laptop、desktop touchscreen、tablet+keyboard、tablet+mouse、Surface+pen、phone+外接键盘、iPad 触控板。**未来 contract 必须是 `deviceClass × administrationMode` 的独立二维结构**，且 administrationMode 来自实际观察到的响应方式（§8），不是设备能力检测。

## 8. AdministrationProvenanceV1 设计（只设计，不实现）

```text
AdministrationProvenanceV1
schemaVersion: 1

deviceClass:          # 环境级 coarse fact（session 开始时一次）
  PHONE | TABLET | DESKTOP_LAPTOP | UNKNOWN

administrationMode:   # 实际观察到的 response modality 汇总（session 级，随作答演进，FINAL 时定稿）
  TOUCH | KEYBOARD_MOUSE | MIXED | UNKNOWN
```

语义规则（指令 §9）：

- `deviceClass` = 环境级 coarse fact，一次采集；判定算法未来实现（2.2），且必须比 trailmaking 现行 innerWidth+pointer:coarse 更稳健（见 Gap D）。
- `administrationMode` = **实际作答**汇总，不是能力检测：全部响应来自 touch → TOUCH；全部来自 mouse/keyboard → KEYBOARD_MOUSE；同时出现两类 → MIXED；无法判定（如无任何 per-response modality 的旧会话）→ UNKNOWN。touchscreen laptop 全程用鼠标 = `DESKTOP_LAPTOP × KEYBOARD_MOUSE`，而非 TOUCH。
- **PEN 取舍（讨论结论）**：产品级 durable provenance 保持 4 值，**不独立 PEN**。理由：pen 当前仅在 trailmaking 出现且为稀有输入；将 PEN 独立会迫使 MIXED 组合空间膨胀（touch+pen、pen+keyboard…）。pen 观察先落入 per-response Research Capture detail（pointerType 已按 attempt 真实保留）；未来若 pilot 数据显示 pen 用户规模或系统差异显著，再以 `schemaVersion: 2` 升级枚举。
- 一次 session 保存一次；不进 scorer；不进学生报告；不做校正；随结果长期可追溯。

## 9. Durable 与 Research Capture 分层（指令 §10）

**A. Durable Administration Provenance**（随 assessment/session 可靠保存，主库）：

- `provenanceVersion` + `deviceClass` + `administrationMode`。
- 用途：未来 reference cohort、norm calibration、device-effect 分析、scientific reanalysis —— 所以不能只进 COS。
- 明确边界：不参与当前 scorer、不参与当前学生/教师报告、不做自动校正。

**B. Research Capture / COS**（未来按科研价值选择性采集）：

- platform family、browser engine、viewport w/h、devicePixelRatio、per-response modality 明细、pen/pointer 细节、visibility/resume 序列、typing-event detail、任务专属交互 trace（tower 逐 move 已有、corsi 逐 tap 未来可加）。
- 不是所有任务采全部字段；按任务 Tier 与实际科研问题决定。

## 10. 隐私红线（指令 §11）

禁止默认采集：IMEI、MAC 地址、序列号、canvas fingerprint、GPU fingerprint、battery fingerprint、font fingerprint、持久硬件 fingerprint、精确地理位置及一切非必需硬件指纹。原则：**只采 measurement provenance 所必需的 coarse technical facts**。当前源码确认无任何上述采集（全库 grep 无 userAgent/maxTouchPoints 使用——trailmaking 的 matchMedia/innerWidth 是唯一设备类 API 使用点）。

## 11. Provisional Tier 分层（24 任务，基于源码与指标）

| Tier | 定义 | 任务 |
|---|---|---|
| **A**（11） | absolute RT 为 primary / difference RT 重要 / 高频短窗响应 / fine-motor 计时在任务内 | reaction, cpt, gonogo, sst, stroop, flanker, taskswitch, patterncompare, lexicaldecision, cardsort, trailmaking |
| **B**（3） | 设备影响操作但主结果非纯 motor/RT（角度代价、序列点击、逐步计时） | mentalrotation（angleCost RT difference）, corsi（连续点击序列）, tower（首步时延 + 逐 move atMs） |
| **C**（10） | 主指标为 accuracy/span/sequence/learning outcome | nback, matrix, emotionrecognition, reversallearning, bart, pairedassociate, picturesequence + **wordlist / memory / digitbackward（输入型备注：软件键盘 vs 物理键盘可能改变输入行为与时长指标，见 §6 Gap F）** |

各 Tier 的未来需求：A = session provenance **必须** + per-response actualInputMode **必须**；B = session provenance 必须 + per-response 按任务决定（tower/corsi 建议要）；C = session provenance 足够（wordlist/memory/digitbackward 另需输入环境识别）。

## 12. Gap 分类汇总（直接决定 Commit 2.2–2.4 设计）

| Gap | 定义 | 命中范围 |
|---|---|---|
| **A｜No provenance** | 支持多输入但零记录 | 全部 22 个无字段任务；其中多模态 5 个（cpt, nback, stroop, lexicaldecision, emotionrecognition）+ memory 最严重 |
| **B｜Collapsed modality** | 多输入塌缩为同一值 | **reaction**（mouse/touch→'pointer'，'touch' 死枚举成员，miss 硬编码 'pointer'）；memory（keypad click vs 物理键汇入同函数）；stroop/lexicaldecision/emotionrecognition（click vs keyboard 同一 response 字段）；cpt/nback（click vs 任意键）；纯 click 任务的 mouse/touch 合成 click |
| **C｜Per-trial duplication** | session 级事实被逐 trial 重复 | **trailmaking deviceClass**（mount 一次求值却写进每个 trial payload，strict schema 固化） |
| **D｜Unreliable device inference** | 设备推断不可靠 | **trailmaking deviceClassOf**：innerWidth<600+pointer:coarse、mount 冻结 → tablet+mouse→desktop、窄窗口→phone、横屏手机+鼠标→desktop、iPad 触控板不可见 |
| **E｜Over-coupled quality** | provenance 缺失直接降 cognitive quality | **trailmaking deviceInfoIncomplete/mixedPointerType**：v1 仅警告，v2 命名推断落 'limited' effect → 整个 result 降级，而 metrics 零影响，科学上应为 provenance warning |
| **F｜Typing confound** | 输入吞吐影响表现但输入环境不可区分 | **wordlist**（自由文本全输入方式不可分）、**memory**（keypad vs 物理键 + guard 计时污染）、**digitbackward**（仅软件键盘，桌面被迫点击） |

## 13. COG-P2 后续预定结构（不执行）

- **Commit 2.2**：Shared AdministrationProvenanceV1 frontend collector / aggregator（统一 deviceClass 采集 + 从实际响应事件聚合 administrationMode；替代 trailmaking 私有 helper）。
- **Commit 2.3**：Actual response modality normalization across runners（reaction 等 runner 改用 pointer 事件区分 mouse/touch/pen/keyboard；统一三种键盘监听模式的 modality 归因）。
- **Commit 2.4**：Durable session-level provenance persistence（FINAL_ONLY、参与 submission/replay identity 或等价 immutable provenance；不进 scorer/report/校正；含 Gap C 的 per-trial→session-level 收口与 Gap E 的 effect 语义修正决策）。
- **Commit 2.5**：Research Capture bridge / detailed technical context（platform/browser/viewport/dpr/per-response 明细 → 未来 COS contract）。
- **Commit 2.6**：Regression + payload/performance characterization（touch/mouse/keyboard/mixed/unknown/触屏笔记本/平板+键盘语义回归；验证 provenance 未造成 FINAL payload/CPU/吞吐回归 —— 属本 PR 自身回归验证，与已移出的 PR #54 optimization lane 完全无关）。

## 14. 本 commit 的检查记录

- 仅新增本文档；`git diff --check` 无空白错误；无一次性分析脚本入库（审计为 agent 只读源码核对）。
- 文中引用的关键源码位置：`frontend/src/modules/cognitive/core/trial-envelope.ts`、`core/useCognitiveSession.ts`、`tasks/reaction/ReactionTask.tsx`、`tasks/trailmaking/TrailmakingTask.tsx`、`tasks/<task>/<Task>Task.tsx`（15 个 RT/选择任务 + 7 个输入/序列任务逐一核对）、`backend/src/modules/cognitive/schemas/trailmaking.trial.ts`、`schemas/reaction.trial.ts`、`scoring/trailmaking.v1.ts`、`v2/registry.ts`、`v2/quality.ts` —— 字段（`inputMode`/`pointerType`/`deviceClass`/`qualityEvents`）与引用行为均经源码确认存在。

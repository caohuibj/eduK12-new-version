# Cognitive Device & Input Provenance Audit v1（COG-P2 Commit 2.1）

- 日期：2026-09-07
- 基线：main @ `6033384`（COG-P1 PR #60 merge 后）；分支 `feat/cognitive-device-input-provenance-v1`
- 性质：**source audit + specification**。本文件记录实施前事实；同一 PR 后续实现状态与最终 deviation 见 `cognitive-device-input-provenance-p2-gate-report.md`。
- 路线声明：PR #54 及旧 performance optimization lane 已从 Cognitive Library 本轮计划完全移出；本审计与该 lane 无关。
- 核心原则：**RECORD, DO NOT CORRECT** —— 本轮不实现任何 touch RT 校正、device 校正、browser timing 补偿、device-specific norm 或 weighting；这些属于未来有真实数据后再判断的问题。
- 事实来源：frontend `server-version/frontend/src/modules/cognitive/`（tasks/、core/）、backend `schemas/*.trial.ts`、`scoring/trailmaking.v1.ts`、`v2/registry.ts`、`v2/quality.ts`。全部结论逐行核对源码得出。

> **Implementation status:** COG-P2 后续已经在 PR #62 中实现 shared session-level `AdministrationProvenanceV1`、FINAL_ONLY local-draft 恢复、task-root modality observation、public/authenticated FINAL 透传、canonical replay identity 绑定和 existing encrypted `CognitiveRawSubmission` durable storage。Reaction `inputMode` 与 Trail Making legacy `deviceClass` 不作为未来 calibration 权威来源；详细 Research Capture/COS 延后至 COG-P5。

---

## 1. 共享数据链路事实（所有任务的公共背景）

1. **TrialEnvelope 没有任何 device/input 字段**（`core/trial-envelope.ts:3-13`）：仅 `schemaVersion/trialIndex/phase/startedAtPerfMs/endedAtPerfMs/durationMs/flags{timeout,premature}/qualityEvents[]/payload`。
2. 输入信息唯一可能的位置是不透明 `payload: Record<string, unknown>`（任务自报，透传存储）。
3. `qualityEvents` 实际只会产生 `visibility_lost`（由 `payload.interrupted===true` 推导）；`window_blur/resume/runner_restart` 枚举值存在但从未被生产。
4. FINAL 链：任务 local payload →（有 protocolSignature 时）`wrapCognitiveTrial` 包 envelope → IndexedDB draft → `submitFinal({trials: payload[]})` → backend `unified-raw-submission`（strict envelope 数组）→ trial schema（strict）校验。审计时链路全程无 device/viewport/UA 附加点；COG-P2 后续实现只在 session FINAL metadata 层补充 coarse provenance，不修改 TrialEnvelope。
5. 审计时**没有共享输入 helper**：`tasks/shared/` 只有 PRNG/词库/practice 常量；唯一 device/pointer 代码是 TrailmakingTask 内部的 `deviceClassOf()`/`pointerTypeOf()`（未共享）。
6. 所有任务监听 `visibilitychange` 记录 `interrupted` —— 这是文档状态标志，不是输入 provenance。

## 2. accepted vs captured（指令 §6 的核心区分）

**UI 接受某种输入 ≠ provenance 已存在。** 审计时全库结论：

| 任务 | acceptedInputModes | capturedInputModes | 记录层级 |
|---|---|---|---|
| reaction | mouse click / touch tap / keyboard（任意键） | **collapsed**：`inputMode: 'pointer'|'keyboard'`（'touch' 从未产生；miss 超时硬编码 'pointer'） | trial（自报，不可靠） |
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

结论：**24 任务中 22 个 zero provenance**；reaction 是“有字段但 collapsed”；trailmaking 是“有真实 per-attempt pointerType + 不可靠 deviceClass”。

## 3. Reaction：exact finding（KNOWN PROVENANCE GAP）

- formal click path 硬编码 `handleFormalInput('pointer')`：mouse/touch collapse；
- `'touch'` enum 成员未由现有 task code 产生；
- miss/timeout 会写 legacy `pointer`；
- keyboard 走独立 window keydown。

COG-P2 后续实现不破坏已 PUBLISHED Reaction trial schema；未来 calibration 使用 session `AdministrationProvenanceV1`，不使用 legacy `inputMode` 作为权威 cohort source。

## 4. Trail Making：exact finding

### 4.1 Device 判定

旧逻辑：`innerWidth < 600 → phone`；`pointer: coarse → tablet`；否则 desktop。存在 tablet+mouse、横屏 phone、窄 desktop window 等误分类风险。

### 4.2 Input 判定

per-attempt `pointerType` 来自真实 `PointerEvent.pointerType`；keyboard 由独立键盘路径注入。

### 4.3 数据重复

旧 `deviceClass` 是 session-level heuristic，却重复写进每个 trial payload。

### 4.4 Scorer coupling

`deviceInfoIncomplete` / `mixedPointerType` 不影响 scorer metrics，也不参与 legacy `interpretable`，但原 v2 fallback 将其视为 `limited`。COG-P2 后续已做窄兼容：这两个 provenance warning 在 v2 adapter 中 `effect: none`；没有开展全库 quality migration。

## 5. 混合模态 RT 任务 exact finding

- CPT / N-Back：click + keyboard，旧 payload 无 modality。
- Stroop / Lexical Decision / Emotion Recognition：click + window keyboard shortcut 汇入同一 response。
- 纯 click 任务仍无法从 click 区分 mouse/touch。
- BART timeout 与 Picture Sequence duration 的其他审计问题不属于本 PR。

COG-P2 后续通过真正 task-root `pointerdown` + keyboard observation 建立 session aggregate，而不是给这些 task trial schema 批量加字段。

## 6. 输入型任务 exact finding（typing confound）

| 任务 | 输入现实 | 结论 |
|---|---|---|
| wordlist | 原生 `<input>`，物理/IME/软件键盘/手写/听写不可可靠区分 | 不能把普通 keydown 当 physical keyboard 证据 |
| memory | 屏幕数字键盘 + physical keyboard 双路，无 legacy modality | coarse session provenance 足够；详细输入留未来 research capture |
| digitbackward | 屏幕键盘 only | desktop 用户也需 pointer/click |
| corsi / picturesequence / tower / pairedassociate | click-based | 保留 task scoring facts，不增加 device trial 字段 |

## 7. Device 与 Input 两个独立轴

```text
Device Class × Administration/Input Mode
```

真实组合包括 touchscreen laptop、desktop touchscreen、tablet+keyboard、tablet+mouse、Surface+pen、phone+external keyboard。禁止 `mobile=touch / desktop=mouse` 假设。

## 8. AdministrationProvenanceV1

```text
schemaVersion: 1

deviceClass:
  PHONE
  TABLET
  DESKTOP_LAPTOP
  UNKNOWN

administrationMode:
  TOUCH
  KEYBOARD_MOUSE
  MIXED
  UNKNOWN
```

`deviceClass` 是 conservative coarse form-factor；`administrationMode` 来自实际观察到的 task interaction aggregate，而不是 touch capability。

## 9. Aggregation semantics

```text
none → UNKNOWN
touch → TOUCH
mouse → KEYBOARD_MOUSE
keyboard → KEYBOARD_MOUSE
mouse + keyboard → KEYBOARD_MOUSE
touch + mouse/keyboard → MIXED
pen only → UNKNOWN
pen + touch → TOUCH
pen + mouse/keyboard → KEYBOARD_MOUSE
```

Timeout / miss / omission / no-response 不产生 modality observation。

## 10. Device inference principle

- precision > coverage；
- 不用 viewport `innerWidth` 做硬件身份；
- 不引入 raw UA parser / third-party device detector；
- 只用少量 coarse browser signals；
- ambiguous touch-capable devices 可以 UNKNOWN；
- cross-device resume 冲突 known form-factor 时降为 UNKNOWN。

## 11. Durable vs Research Capture

### 当前 COG-P2 durable

- local FINAL draft 保存 coarse provenance，可刷新恢复；
- FINAL submit 有 provenance 时进入 canonical replay identity；
- once/attempt 保存于 existing encrypted `CognitiveRawSubmission` envelope；
- 不进 scorer / result snapshot / report / Bundle。

### Future COG-P5 Research Capture

按任务价值选择 platform/browser/viewport/DPR/per-response modality/typing detail/visibility-resume 等。当前不提前建立 COS bridge。

## 12. 隐私红线

禁止默认采集 IMEI、MAC、serial、canvas/WebGL/GPU/font/audio/battery fingerprint、persistent hardware identifier、precise geolocation。V1 durable contract 不保存 raw user-agent。

## 13. Provisional tiers

批准的 Cognitive device-sensitivity matrix：

- Tier A — high sensitivity / future per-response modality useful（11）：reaction, cpt, gonogo, sst, stroop, flanker, taskswitch, patterncompare, trailmaking, lexicaldecision, cardsort
- Tier B — medium（9）：nback, matrix, mentalrotation, tower, reversallearning, bart, emotionrecognition, pairedassociate, picturesequence
- Tier C — accuracy/span dominant（4）：memory, corsi, digitbackward, wordlist

这些只是 engineering/research prioritization hint，不是新的 scientific evidence truth。

## 14. 当前实现边界

已实现：shared provenance core、final-draft metadata durability、task-root observation、public/authenticated FINAL propagation、historical-hash-compatible replay identity、existing raw envelope durability、Trail Making provenance warning compatibility。

未实现：device correction、device-specific norms、COS、detailed research telemetry、Cognitive performance optimization、24-task trial-schema migration。

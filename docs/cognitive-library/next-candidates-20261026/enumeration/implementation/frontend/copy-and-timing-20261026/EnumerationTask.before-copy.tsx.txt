import React, { useEffect, useMemo, useRef, useState } from 'react'
import { enumerationPlan, type EnumerationInput } from './generated/protocol'
import { projectEnumerationReport, type EnumerationPublicResult } from './generated/report'
import { enumerationArtifact, enumerationDigest, enumerationGeometry, enumerationStartBlock,
  readEnumerationViewport, validateEnumerationContext, type EnumerationContext } from './display'
import { EnumerationCapture, drawEnumerationFrame, type EnumerationRecord, type EnumerationStage } from './capture'
import { EnumerationPersistence, type EnumerationPersistencePort } from './persistence'
import './enumeration.css'
export interface EnumerationTaskProps {
  context: EnumerationContext
  persistence: EnumerationPersistencePort
  /** Optional frozen host result. The generated report projection still suppresses all research metrics. */
  result?: EnumerationPublicResult
}
const blockedText: Record<string, [string, string]> = {
  missing_calibration: ['主机尚未提供带来源的屏幕与观看距离校准，不能开始。', 'The host has not supplied sourced screen and viewing-distance calibration.'],
  missing_recipe: ['主机尚未提供明确的候选刺激配方，不能开始。', 'The host has not supplied an explicit candidate stimulus recipe.'],
  display_changed: ['屏幕、缩放或方向已变化，需要主机重新校准；不会自动缩小刺激。', 'Display, zoom or orientation changed. Host recalibration is required; stimuli will not shrink.'],
  field_does_not_fit: ['校准后的刺激区域放不下，请更换合适的屏幕或观看设置；不会自动缩小。', 'The calibrated field does not fit. Use an appropriate display or viewing setup; it will not shrink.'],
  attempt_ended: ['本次候选序列已因中断结束。原记录保留供保存重试；不能继续曝光，请由主机另开施测。', 'This candidate attempt ended after interruption. Keep its records for saving retries; the host must start a new attempt.'],
  invalid_context: ['候选配置或配方不兼容，不能开始。', 'The candidate configuration or recipe is incompatible.'],
}
/** Keying the whole immutable context prevents callbacks from one attempt migrating into another. */
export function EnumerationTask(props: EnumerationTaskProps) {
  try {
    validateEnumerationContext(props.context)
    if (!props.persistence?.id || props.persistence.id.length > 256
      || props.persistence.durability?.kind !== 'host_verified_browser_durable' || !props.persistence.durability.verificationId) throw Error('Missing explicit persistence port')
  } catch {
    return <section className="enumeration-candidate"><p role="alert">内部候选配置或保存端口不兼容，无法开始。 / Invalid candidate context or persistence port.</p></section>
  }
  const key = enumerationDigest({ context: props.context, portId: props.persistence.id })
  return <EnumerationSession key={key} {...props} />
}
function EnumerationSession({ context: incoming, persistence: incomingPort, result }: EnumerationTaskProps) {
  const persistence = useMemo<EnumerationPersistencePort>(() => ({
    id: incomingPort.id, durability: { ...incomingPort.durability },
    openAttempt: incomingPort.openAttempt.bind(incomingPort), endAttempt: incomingPort.endAttempt.bind(incomingPort),
    retainArtifact: incomingPort.retainArtifact.bind(incomingPort), reserve: incomingPort.reserve.bind(incomingPort),
    retain: incomingPort.retain.bind(incomingPort), onTrialComplete: incomingPort.onTrialComplete.bind(incomingPort),
    onPracticeComplete: incomingPort.onPracticeComplete.bind(incomingPort), complete: incomingPort.complete.bind(incomingPort),
  }), [])
  const context = useMemo(() => structuredClone(incoming), [])
  const en = context.language === 'en', synthetic = context.recipe?.source === 'synthetic_fixture' || context.calibration?.source === 'synthetic_fixture'
  const [view, setView] = useState<'intro' | 'ready' | 'running' | 'saving' | 'feedback' | 'error' | 'report'>('intro')
  const [stage, setStage] = useState<EnumerationStage>('pending')
  const [practiceIndex, setPracticeIndex] = useState(0), [practiceRepeat, setPracticeRepeat] = useState(0)
  const [formal, setFormal] = useState(false), [formalIndex, setFormalIndex] = useState(0)
  const [slider, setSlider] = useState(1), [error, setError] = useState(''), [block, setBlock] = useState<string | null>(null)
  const [lastPractice, setLastPractice] = useState<EnumerationRecord | null>(null)
  const [lastInterrupted, setLastInterrupted] = useState(false)
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const range = useRef<HTMLInputElement>(null), confirm = useRef<HTMLButtonElement>(null)
  const capture = useRef<EnumerationCapture | null>(null), alive = useRef(true), busy = useRef(false)
  const gate = useRef<EnumerationPersistence | null>(null), retry = useRef<(() => Promise<void>) | null>(null)
  const inputSource = useRef<EnumerationInput>('keyboard'), confirmSource = useRef<EnumerationInput>('keyboard')
  const artifact = useMemo(() => context.calibration && context.recipe ? enumerationArtifact(context) : null, [context])
  const geometry = context.calibration && context.recipe ? enumerationGeometry(context.calibration, context.recipe) : null
  const readBlock = () => {
    if (gate.current?.attemptEnded) return 'attempt_ended'
    const rect = root.current?.getBoundingClientRect()
    return enumerationStartBlock(context, readEnumerationViewport(), (rect?.width ?? 0) - 40,
      window.innerHeight - Math.max(0, rect?.top ?? 0) - 300)
  }
  useEffect(() => {
    alive.current = true
    const owned = artifact ? new EnumerationPersistence(artifact, persistence) : null
    gate.current = owned
    return () => {
      alive.current = false
      const current = capture.current
      if (current && current.stage !== 'complete') {
        current.interrupt('runner_restart', performance.now())
        // Host stages this old-context record synchronously; it owns pending recovery after unmount.
        // No later onTrialComplete/final callback is issued by this disposed session.
        const record = current.record()
        try { void persistence.retain({ record, recordHash: enumerationDigest(record) }).catch(() => { /* host-owned unresolved retention */ }) } catch { /* reservation remains unresolved; host must recover */ }
      }
      owned?.dispose(); retry.current = null
    }
  }, [artifact, persistence])
  useEffect(() => {
    const update = () => setBlock(readBlock())
    update(); window.addEventListener('resize', update); window.visualViewport?.addEventListener('resize', update)
    return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update) }
  }, [view])
  async function finalSave(owned: EnumerationPersistence) {
    if (busy.current || !alive.current) return
    busy.current = true; setView('saving')
    try { await owned.finalize(); if (!alive.current) return; retry.current = null; setView('report') }
    catch { if (alive.current) { retry.current = () => finalSave(owned); setError(en ? 'Final saving is not confirmed. Retry the same submission; no trial will be shown again.' : '最终保存尚未确认。请重试同一份提交，不会重复呈现任何试次。'); setView('error') } }
    finally { busy.current = false }
  }
  async function saveRecord(snapshot: EnumerationRecord) {
    if (busy.current || !alive.current || !gate.current) return
    busy.current = true; setView('saving')
    const owned = gate.current
    try {
      await owned.save(snapshot); if (!alive.current || gate.current !== owned) return
      retry.current = null
      if (snapshot.core.phase === 'practice') { setLastPractice(snapshot); setView('feedback') }
      else if (snapshot.core.plan.trialIndex === context.config.totalTrials - 1) {
        busy.current = false; await finalSave(owned); return
      } else {
        setFormalIndex(snapshot.core.plan.trialIndex + 1)
        setLastInterrupted(snapshot.raw.completion !== 'confirmed'); setView('ready')
      }
    } catch {
      if (alive.current && gate.current === owned) {
        retry.current = () => saveRecord(snapshot)
        setError(en ? 'Saving is not confirmed. The captured record is retained; retry saving without repeating the exposure.' : '保存尚未确认。原记录已交给本机保存端口保留，请重试保存，不会重复呈现。'); setView('error')
      }
    } finally { busy.current = false }
  }
  const finish = useRef<(value: EnumerationCapture) => void>(() => {})
  finish.current = value => { if (!busy.current && alive.current) void saveRecord(value.record()) }
  async function start() {
    if (busy.current || !alive.current) return
    const reason = readBlock(); setBlock(reason)
    if (reason || !artifact || !gate.current || !geometry) return
    busy.current = true
    const owned = gate.current, phase = formal ? 'test' : 'practice', index = formal ? formalIndex : practiceIndex
    const exposureId = phase + '-' + index + '-' + (formal ? 0 : practiceRepeat) + '-'
      + enumerationDigest([context.attemptId, phase, index, formal ? 0 : practiceRepeat]).slice(0, 32)
    try {
      const value = new EnumerationCapture(context, enumerationPlan(context.config, context.randomSeed, index, phase), exposureId, artifact.artifactHash, formal ? 0 : practiceRepeat)
      await owned.prepare({ contextId: context.contextId, attemptId: context.attemptId, exposureId, artifactHash: artifact.artifactHash, phase, trialIndex: index, exposureOrdinal: formal ? 0 : practiceRepeat })
      if (!alive.current || gate.current !== owned) return
      const changed = readBlock(); if (changed) { setBlock(changed); throw Error('Display changed after reservation') }
      capture.current = value; setSlider(value.sliderValue); setStage('pending'); setView('running')
    } catch {
      if (alive.current && gate.current === owned) {
        retry.current = null
        setError(en ? 'The exposure has not started, or its reservation is unresolved. Keep this page open and ask the host to recover it; do not repeat it.' : '呈现尚未开始，或该曝光已有未决记录。请保留页面并由主机恢复，不要重复呈现。'); setView('error')
      }
    } finally { busy.current = false }
  }
  useEffect(() => {
    if (view !== 'running' || !capture.current || !artifact || !geometry) return
    const value = capture.current, element = canvas.current!, ctx = element.getContext('2d')
    let frame = 0, active = true
    if (!ctx) { value.interrupt('runner_restart', performance.now()); finish.current(value); return }
    const paint = (now: number) => {
      if (!active) return
      const before = value.stage, next = value.frame(now)
      if (next === 'complete') { finish.current(value); return }
      drawEnumerationFrame(ctx, value, artifact, geometry.fieldCssPx, context.calibration!.devicePixelRatio)
      // These DOM visibility/disabled changes occur in this paint callback, not after a deferred React commit.
      if (root.current) root.current.dataset.stage = next
      if (range.current) range.current.disabled = next !== 'response'
      if (confirm.current) confirm.current.disabled = next !== 'response'
      if (before !== next) setStage(next)
      if (next !== 'response') frame = requestAnimationFrame(paint)
    }
    const interrupt = (reason: EnumerationRecord['core']['interruptions'][number]) => {
      if (value.stage === 'complete') return
      gate.current?.end(reason); setBlock('attempt_ended')
      value.interrupt(reason, performance.now()); finish.current(value)
    }
    const hidden = () => { if (document.hidden) interrupt('visibility_lost') }
    const blur = () => interrupt('window_blur')
    const pagehide = () => interrupt('runner_restart')
    const resize = () => { if (readBlock()) interrupt('viewport_changed') }
    document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur); window.addEventListener('pagehide', pagehide)
    window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize)
    frame = requestAnimationFrame(paint)
    return () => { active = false; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('blur', blur); window.removeEventListener('pagehide', pagehide); window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize) }
  }, [view, artifact])
  const practiceConfirmed = lastPractice?.raw.completion === 'confirmed' && lastPractice.core.responseValue !== null
  const report = projectEnumerationReport(result ?? { metrics: {}, quality: { state: 'invalid', flags: {}, reasons: [] } })
  const issue = block && (blockedText[block] ?? blockedText.invalid_context)
  const premature = (input: EnumerationInput) => {
    const value = capture.current
    if (view !== 'running' || !value || ['response', 'complete'].includes(value.stage)) return
    value.premature(input, performance.now()); if (value.stage === 'complete') finish.current(value)
  }
  return <div ref={root} className="enumeration-candidate" data-cognitive-task-root="true" data-stage={stage} data-enumeration-view={view}
    onPointerDownCapture={event => { if (event.isPrimary && event.button === 0) premature(event.pointerType === 'touch' ? 'touch' : 'pointer') }}
    onKeyDownCapture={event => { if (['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) premature('keyboard') }}>
    <div className="enum-badge">{synthetic ? (en ? 'Actual candidate component · Synthetic host fixture · Internal review only' : '实际候选组件 · 合成主机fixture · 仅内部审阅')
      : (en ? 'Internal candidate · Not authorized for formal administration' : '内部候选 · 尚未授权正式施测')}</div>
    {view === 'intro' && <section className="enum-reading"><h1>{en ? 'How many dots did you see?' : '刚才有几个点？'}</h1>
      <p>{en ? 'Keep looking at the centre. White dots briefly appear on a mid-grey field, followed by a noise mask. Report the number you saw.' : '请注视画面中央。白色圆点会在中灰背景上短暂出现，随后被噪声遮罩覆盖。请报告刚才看到的点数。'}</p>
      <p>{en ? 'Use the integer slider from 1 to 15, then confirm. Its initial value changes each trial; it is not a hint.' : '拖动1–15整数滑杆，再点击确认。每轮初值随机变化，它不是答案提示。'}</p>
      <p>{en ? `First complete 3 practice trials. This ${context.config.profile} sequence contains ${context.config.totalTrials} formal trials. Formal trials give no correctness feedback.`
        : `先完成3次练习。本次${formal ? '候选' : context.config.profile === 'research' ? '文献对照' : '体验'}序列含${context.config.totalTrials}次正式记录，正式阶段不提示对错。`}</p>
      <details><summary>{en ? 'Keyboard and screen setup' : '键盘操作与屏幕设置'}</summary><p>{en ? 'Arrow keys adjust the slider; Home and End select 1 and 15. Tab to Confirm and press Enter or Space. Screen size, viewing distance and mask recipe must come from the host. This candidate does not validate physical luminance or display timing.' : '方向键调整滑杆，Home/End选择1/15；Tab切到确认后按回车或空格。屏幕尺寸、观看距离与遮罩配方须由主机明确提供；本候选不验证物理亮度或显示时序。'}</p></details>
      <p className="enum-notice">{en ? 'This is an internal candidate. The interface and 100/25 trial counts were approved; timing, calibration and individual interpretation still require validation.' : '这是内部候选。界面与100/25次数已确认，真实时序、校准和个体解释仍待验证。'}</p>
      <div className="enum-actions"><button onClick={() => setView('ready')}>{en ? 'Review readiness' : '查看准备状态'}</button></div></section>}
    {view === 'ready' && <section className="enum-reading"><h1>{formal ? ((formalIndex > 0 && formalIndex % 25 === 0) ? (en ? 'Take a short break' : '休息一下') : (en ? 'Ready for the next candidate trial' : '准备下一轮候选记录')) : (en ? 'Try the practice' : '先来练习')}</h1>
      <p>{formal ? `${formalIndex + 1} / ${context.config.totalTrials}` : `${practiceIndex + 1} / 3`}</p>
      <p>{en ? 'Keep the device still and maintain the calibrated viewing distance. Start when ready.' : '请放稳设备，保持校准时的观看距离，准备好后再开始。'}</p>
      {lastInterrupted && <p className="enum-notice">{en ? 'The previous interrupted record was retained. It will not be silently repeated.' : '上一轮中断记录已保留，不会自动补做或重复曝光。'}</p>}
      {issue && <p role="alert">{issue[en ? 1 : 0]}</p>}
      <div className="enum-actions"><button disabled={!!block || !artifact} onClick={() => void start()}>{formal ? (en ? 'Start candidate trial' : '开始候选正式轮') : (en ? 'Start practice' : '开始练习')}</button></div></section>}
    {view === 'running' && geometry && <section>
      <div className="enum-progress"><span>{formal ? (en ? 'Candidate formal sequence' : '候选正式序列') : (en ? 'Practice' : '练习')}</span><span>{(formal ? formalIndex : practiceIndex) + 1} / {formal ? context.config.totalTrials : 3}</span></div>
      <div className="enum-field-space"><canvas ref={canvas} width={Math.ceil(geometry.fieldCssPx * context.calibration!.devicePixelRatio)} height={Math.ceil(geometry.fieldCssPx * context.calibration!.devicePixelRatio)}
        style={{ width: geometry.fieldCssPx, height: geometry.fieldCssPx }} aria-hidden="true" /></div>
      <div className="enum-response"><label htmlFor="enumeration-slider">{en ? 'How many dots?' : '刚才有几个点？'}</label>
        <output htmlFor="enumeration-slider">{slider}</output>
        <input ref={range} id="enumeration-slider" type="range" min={1} max={15} step={1} value={slider} disabled={stage !== 'response'} aria-valuetext={String(slider)}
          onPointerDown={event => { inputSource.current = event.pointerType === 'touch' ? 'touch' : 'pointer' }} onKeyDown={() => { inputSource.current = 'keyboard' }}
          onChange={event => { const value = capture.current!; if (value.change(Number(event.currentTarget.value), inputSource.current, performance.now())) setSlider(value.sliderValue); if (value.stage === 'complete') finish.current(value) }} />
        <div className="enum-range-ends" aria-hidden="true"><span>1</span><span>15</span></div>
        <button ref={confirm} className="enum-confirm" disabled={stage !== 'response'} onPointerDown={event => { confirmSource.current = event.pointerType === 'touch' ? 'touch' : 'pointer' }}
          onKeyDown={() => { confirmSource.current = 'keyboard' }} onClick={() => { const value = capture.current!; if (value.confirm(confirmSource.current, performance.now())) finish.current(value) }}>{en ? 'Confirm' : '确认'}</button>
      </div></section>}
    {view === 'feedback' && <section className="enum-reading"><h1>{en ? 'Practice record' : '练习记录'}</h1>
      {practiceConfirmed ? <p>{en ? `There were ${lastPractice!.core.plan.targetValue} dots. You reported ${lastPractice!.core.responseValue}.` : `刚才有${lastPractice!.core.plan.targetValue}个点，你报告了${lastPractice!.core.responseValue}个。`}</p>
        : <p>{en ? 'This practice was interrupted. No correctness judgment is given.' : '这轮练习中断了，不判断对错，也不算作已完成练习。'}</p>}
      <div className="enum-actions"><button disabled={practiceRepeat >= 11 || gate.current?.attemptEnded} onClick={() => {
        if (!practiceConfirmed) { setPracticeRepeat(value => value + 1); setView('ready') }
        else if (practiceIndex < 2) { setPracticeIndex(value => value + 1); setPracticeRepeat(0); setView('ready') }
        else { setFormal(true); setFormalIndex(0); setView('ready') }
      }}>{!practiceConfirmed ? (en ? 'Retry this practice explicitly' : '重新做这轮练习') : practiceIndex < 2 ? (en ? 'Next practice' : '下一次练习') : (en ? 'Prepare candidate formal sequence' : '准备候选正式序列')}</button></div>
      {gate.current?.attemptEnded && <p role="alert">{blockedText.attempt_ended[en ? 1 : 0]}</p>}
      {practiceRepeat >= 11 && <p role="alert">{en ? 'The practice exposure budget is reached. Ask the host to review the interruptions.' : '已达到练习曝光预算，请由主机检查中断情况。'}</p>}</section>}
    {view === 'saving' && <p role="status">{en ? 'Waiting for the host saving receipt…' : '正在等待主机确认保存…'}</p>}
    {view === 'error' && <section><p role="alert">{error}</p>{retry.current && <button onClick={() => { if (!busy.current) void retry.current?.() }}>{en ? 'Retry saving' : '重试保存'}</button>}</section>}
    {view === 'report' && <section className="enum-reading"><h1>{en ? 'Your candidate record' : '这次的候选记录'}</h1>
      <p>{synthetic ? (en ? 'Synthetic host receipt only; no production persistence is demonstrated.' : '当前仅为合成主机回执，不代表生产后台已保存。') : (en ? 'The host confirmed this candidate submission.' : '主机已确认本次候选提交。')}</p>
      <div className="enum-state" data-report-state={report.state}><h2>{en ? 'No performance conclusion yet' : '本次不提供表现结论'}</h2><p>{en ? 'Presentation and interpretation quality rules are still awaiting validation. Research metrics are hidden.' : report.reasons.join(' ')}</p></div>
      <p>{en ? 'For next time: keep the device still, reduce interruptions and maintain your viewing position.' : '下次可把设备放稳，减少通知干扰，并保持观看位置。'}</p>
      <p className="enum-muted">{en ? 'No applicable norms, ranks, ability grades or diagnostic conclusions. No decorative chart is generated.' : '暂无适用常模，不提供排名、能力等级或诊断结论。本页不生成装饰性图表。'}</p></section>}
  </div>
}

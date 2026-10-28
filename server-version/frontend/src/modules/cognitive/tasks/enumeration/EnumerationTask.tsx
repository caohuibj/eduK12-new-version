import React, { useEffect, useMemo, useRef, useState } from 'react'
import { type EnumerationInput } from './generated/protocol'
import type { EnumerationPublicResult, EnumerationStoredSnapshot } from './generated/report'
import { EnumerationReport } from './EnumerationReport'
import { EnumerationInstructions } from './EnumerationInstructions'
import { enumerationArtifact, enumerationDigest, enumerationGeometry, enumerationStartBlock,
  readEnumerationViewport, validateEnumerationContext, enumerationContextPlan, type EnumerationContext } from './display'
import { EnumerationCapture, drawEnumerationFrame, type EnumerationRecord, type EnumerationStage } from './capture'
import { EnumerationPersistence, type EnumerationPersistencePort } from './persistence'
import './enumeration.css'
export interface EnumerationTaskProps {
  context: EnumerationContext
  /** Native host routes to its authoritative saved report; core confirmation is not archive confirmation. */
  hostManagedReport?: boolean
  persistence: EnumerationPersistencePort
  /** Optional frozen host result. The generated report projection permits only version-compatible session descriptions. */
  result?: EnumerationPublicResult
  storedResult?: EnumerationStoredSnapshot
}
const blockedText: Record<string, [string, string]> = {
  missing_calibration: ['请先完成屏幕与观看距离设置。', 'Please complete the screen and viewing-distance setup first.'],
  missing_recipe: ['当前测验尚未完成施测设置，请联系发布者。', 'This assessment is not ready yet. Please contact its publisher.'],
  display_changed: ['屏幕、缩放或方向变了，请重新完成屏幕与观看距离设置。', 'The screen, zoom or orientation changed. Please repeat the screen and viewing-distance setup.'],
  field_does_not_fit: ['当前屏幕放不下测验画面。请调整观看设置或更换设备后重试。', 'The assessment display does not fit this screen. Adjust the viewing setup or use another device.'],
  attempt_ended: ['这次作答已因中断结束。请保持页面打开以便完成提交；如需重新作答，请联系发布者。', 'This attempt ended after an interruption. Keep the page open to finish submitting. Contact the publisher if you need to try again.'],
  invalid_context: ['当前测验尚未完成施测设置，请联系发布者。', 'This assessment is not ready yet. Please contact its publisher.'],
}
/** Keying the whole immutable context prevents callbacks from one attempt migrating into another. */
export function EnumerationTask(props: EnumerationTaskProps) {
  try {
    validateEnumerationContext(props.context)
    if (!props.persistence?.id || props.persistence.id.length > 256
      || props.persistence.durability?.kind !== 'host_verified_browser_durable' || !props.persistence.durability.verificationId) throw Error('Missing explicit persistence port')
  } catch {
    return <section className="enumeration-candidate"><p role="alert">内部审阅版暂未就绪，请联系发布者。 / This internal review version is not ready. Please contact its publisher.</p></section>
  }
  const key = enumerationDigest({ context: props.context, portId: props.persistence.id })
  return <EnumerationSession key={key} {...props} />
}
function EnumerationSession({ context: incoming, persistence: incomingPort, result, storedResult,hostManagedReport }: EnumerationTaskProps) {
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
    catch { if (alive.current) { retry.current = () => finalSave(owned); setError(en ? 'Submission is not confirmed. Keep this page open and retry. You will not need to answer again.' : '提交尚未确认，请保持页面打开并重试。无需重复作答。'); setView('error') } }
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
        setError(en ? 'Submission is not confirmed. Keep this page open and retry. Your answers remain here, so you do not need to answer again.' : '提交尚未确认，请保持页面打开并重试。已作答内容仍在此页面等待提交，无需重复作答。'); setView('error')
      }
    } finally { busy.current = false }
  }
  const finish = useRef<(value: EnumerationCapture) => void>(() => {})
  finish.current = value => { if (!busy.current && alive.current) {
    const record=value.record()
    if(record.raw.completion!=='confirmed'){gate.current?.end('capture_incomplete');setBlock('attempt_ended')}
    void saveRecord(record)
  } }
  async function start() {
    if (busy.current || !alive.current) return
    const reason = readBlock(); setBlock(reason)
    if (reason || !artifact || !gate.current || !geometry) return
    busy.current = true
    const owned = gate.current, phase = formal ? 'test' : 'practice', index = formal ? formalIndex : practiceIndex
    const exposureId = phase + '-' + index + '-' + (formal ? 0 : practiceRepeat) + '-'
      + enumerationDigest([context.attemptId, phase, index, formal ? 0 : practiceRepeat]).slice(0, 32)
    try {
      const value = new EnumerationCapture(context, enumerationContextPlan(context, index, phase), exposureId, artifact.artifactHash, formal ? 0 : practiceRepeat)
      await owned.prepare({ contextId: context.contextId, attemptId: context.attemptId, exposureId, artifactHash: artifact.artifactHash, phase, trialIndex: index, exposureOrdinal: formal ? 0 : practiceRepeat })
      if (!alive.current || gate.current !== owned) return
      const changed = readBlock(); if (changed) { setBlock(changed); throw Error('Display changed after reservation') }
      capture.current = value; setSlider(value.sliderValue); setStage('pending'); setView('running')
    } catch {
      if (alive.current && gate.current === owned) {
        retry.current = null
        setError(en ? 'This attempt cannot start right now. Keep the page open and contact the publisher before trying again.' : '这次作答暂时无法开始。请保持页面打开并联系发布者，避免重复作答。'); setView('error')
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
  const issue = block && (blockedText[block] ?? blockedText.invalid_context)
  const premature = (input: EnumerationInput) => {
    const value = capture.current
    if (view !== 'running' || !value || ['response', 'complete'].includes(value.stage)) return
    value.premature(input, performance.now()); if (value.stage === 'complete') finish.current(value)
  }
  return <div ref={root} className="enumeration-candidate" data-cognitive-task-root="true" data-stage={stage} data-enumeration-view={view}
    onPointerDownCapture={event => { if (event.isPrimary && event.button === 0) premature(event.pointerType === 'touch' ? 'touch' : 'pointer') }}
    onKeyDownCapture={event => { if (['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) premature('keyboard') }}>
    <div className="enum-badge">{synthetic ? (en ? 'Actual interface · Synthetic setup · Internal review only' : '实际界面 · 合成设置演示 · 仅供内部审阅')
      : (en ? 'Internal review version · Not for formal use' : '内部审阅版 · 暂不用于正式施测')}</div>
    {view === 'intro' && <section className="enum-reading"><EnumerationInstructions en={en} config={context.config}/>
      <div className="enum-actions"><button onClick={() => setView('ready')}>{en ? 'Review readiness' : '查看准备状态'}</button></div></section>}
    {view === 'ready' && <section className="enum-reading"><h1>{formal ? ((formalIndex > 0 && formalIndex % 25 === 0) ? (en ? 'Take a short break' : '休息一下') : (en ? 'Ready for the next trial' : '准备开始下一轮')) : (en ? 'Try the practice' : '先来练习')}</h1>
      <p>{formal ? `${formalIndex + 1} / ${context.config.totalTrials}` : `${practiceIndex + 1} / 3`}</p>
      <p>{en ? 'Keep the device still and maintain the viewing distance used during setup. Start when ready.' : '请放稳设备，保持屏幕设置时的观看距离，准备好后再开始。'}</p>
      {lastInterrupted && <p className="enum-notice">{en ? 'The previous trial was interrupted. It will not be repeated automatically.' : '上一轮因中断结束，不会自动重复作答。'}</p>}
      {issue && <p role="alert">{issue[en ? 1 : 0]}</p>}
      <div className="enum-actions"><button disabled={!!block || !artifact} onClick={() => void start()}>{formal ? (en ? 'Start trial' : '开始这一轮') : (en ? 'Start practice' : '开始练习')}</button></div></section>}
    {view === 'running' && geometry && <section>
      <div className="enum-progress"><span>{formal ? (en ? 'Assessment' : '作答') : (en ? 'Practice' : '练习')}</span><span>{(formal ? formalIndex : practiceIndex) + 1} / {formal ? context.config.totalTrials : 3}</span></div>
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
      {(!practiceConfirmed||lastPractice!.core.responseValue!==lastPractice!.core.plan.targetValue)&&<EnumerationInstructions en={en} config={context.config} headingLevel={2}/>}
      <div className="enum-actions"><button disabled={practiceRepeat >= 11 || gate.current?.attemptEnded} onClick={() => {
        if (!practiceConfirmed) { setPracticeRepeat(value => value + 1); setView('ready') }
        else if (practiceIndex < 2) { setPracticeIndex(value => value + 1); setPracticeRepeat(0); setView('ready') }
        else { setFormal(true); setFormalIndex(0); setView('ready') }
      }}>{!practiceConfirmed ? (en ? 'Retry this practice explicitly' : '重新做这轮练习') : practiceIndex < 2 ? (en ? 'Next practice' : '下一次练习') : (en ? 'Prepare to continue' : '准备开始作答')}</button></div>
      {gate.current?.attemptEnded && <p role="alert">{blockedText.attempt_ended[en ? 1 : 0]}</p>}
      {practiceRepeat >= 11 && <p role="alert">{en ? 'Practice has been interrupted repeatedly. Please contact the publisher before continuing.' : '练习多次中断，请联系发布者后再继续。'}</p>}</section>}
    {view === 'saving' && <p role="status">{en ? 'Submitting… Please keep this page open.' : '正在提交，请保持页面打开…'}</p>}
    {view === 'error' && <section><p role="alert">{error}</p>{retry.current && <button onClick={() => { if (!busy.current) void retry.current?.() }}>{en ? 'Retry submission' : '重试提交'}</button>}</section>}
    {view === 'report' && hostManagedReport && <p role="status">{en ? 'Your answers were submitted. Loading the saved report…' : '作答已提交，正在读取已保存报告…'}</p>}
    {view === 'report' && !hostManagedReport && <section className="enum-reading"><h1>{en ? 'Your record' : '这次的记录'}</h1>
      <p>{synthetic ? (en ? 'This is a synthetic demonstration. It does not confirm submission of a real assessment.' : '当前为合成演示，不代表真实作答已提交。') : (en ? 'Your submission is confirmed.' : '本次作答已确认提交。')}</p>
      <EnumerationReport result={result} storedResult={storedResult} config={context.config} randomSeed={context.randomSeed} language={context.language} />
      <p>{en ? 'For next time: keep the device still, reduce interruptions and maintain your viewing position.' : '下次可把设备放稳，减少通知干扰，并保持观看位置。'}</p>
      <p className="enum-muted">{en ? 'No applicable norms, rankings, ability grades or diagnostic conclusions are available.' : '目前没有适用常模，不提供排名、能力等级或诊断结论。'}</p></section>}
  </div>
}

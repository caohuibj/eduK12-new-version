import React, { useEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Category, Input, IstActivation } from './generated/protocol'
import { IstSession } from './session'
import { digest, type IstContext, type IstPorts } from './contracts'
import { IstInstructions, IST_QUESTIONS } from './IstInstructions'
import { IstReport } from './IstReport'
import './ist.css'
export interface IstTaskProps { context: IstContext; ports: IstPorts; language?: 'zh' | 'en' }
/** Isolated content candidate. No registry, delivery, durable storage or COS implementation is installed here. */
export function IstTask({ context, ports, language = context.language }: IstTaskProps) {
  const [, render] = useReducer(n => n + 1, 0), alive = useRef(true), lifecycle = useRef(0), invalid = useRef(false), initial = useRef({ key: digest(context), ports, language }), gridRef = useRef<HTMLDivElement>(null), starting = useRef<number | null>(null)
  const [holder] = useState(() => { try { return { session: new IstSession(context, ports, () => { if (alive.current) render() }) } } catch { return { error: true as const } } })
  const s = holder.session, view = s?.view ?? 'blocked', cap = s?.capture, stage = cap?.raw.state.stage, en = language === 'en'
  if (language !== context.language || initial.current.key !== digest(context) || initial.current.ports !== ports || initial.current.language !== language) invalid.current = true
  useEffect(() => {
    const generation = ++lifecycle.current
    alive.current = true
    const disposeIfUnmounted = () => { if (lifecycle.current === generation && !alive.current) s?.dispose() }
    return () => {
      alive.current = false
      if (starting.current !== null) { cancelAnimationFrame(starting.current); starting.current = null }
      // StrictMode replays setup before this microtask; a real unmount does not.
      queueMicrotask(disposeIfUnmounted)
    }
  }, [s])
  useEffect(() => { if (invalid.current) s?.dispose() }, [s, context, ports, language])
  useEffect(() => {
    if (!s || !cap || view !== 'running' || invalid.current) return
    const cancelHeld = (token: string) => { const h = cap.raw.state.held.find(x => x.token === token); if (h && alive.current && !invalid.current) s.input({ kind: 'cancel', atMs: performance.now(), target: h.target, input: h.input, token: h.token, key: h.key, repeat: false }) }
    const release = (e: PointerEvent) => { if (!e.defaultPrevented) cancelHeld('pointer:' + e.pointerId) }, keyUp = (e: KeyboardEvent) => { if (!e.defaultPrevented) cancelHeld('key:' + (e.code || e.key)) }
    const stop = (reason: string) => s.stop(reason, performance.now()), blur = () => stop('blur'), hidden = () => { if (document.hidden) stop('hidden') }, pagehide = () => stop('page-hidden')
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur); window.addEventListener('pagehide', pagehide); document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', hidden) }
  }, [s, cap, view])
  useEffect(() => {
    if (!s || !cap || view !== 'running' || stage !== 'feedback' || cap.raw.state.feedbackUntilMs === null || invalid.current) return
    let timer: ReturnType<typeof setTimeout>
    const finishFeedback = () => {
      if (!alive.current || invalid.current || s.capture !== cap) return
      flushSync(() => s.tick(performance.now()))
      // A browser timer may wake slightly early. Keep the same feedback; never re-expose or block for a frame error.
      if (s.capture === cap && cap.raw.state.stage === 'feedback' && cap.raw.state.feedbackUntilMs !== null) timer = setTimeout(finishFeedback, Math.max(1, cap.raw.state.feedbackUntilMs - performance.now()))
    }
    timer = setTimeout(finishFeedback, Math.max(0, cap.raw.state.feedbackUntilMs - performance.now()))
    return () => clearTimeout(timer)
  }, [s, cap, stage, view])
  if (!s || invalid.current) return <section className="ist-root" role="alert">{en ? 'This frozen attempt cannot continue. Keep this page and contact the organiser.' : '本冻结作答无法继续，请保留本页并联系组织者。'}</section>
  if (view === 'report' && s.receipt) return <IstReport report={s.receipt.report} language={language} />
  const c = s.context.snapshot.config, p = cap?.raw.plan, state = cap?.raw.state, next = s.manifest.formal[s.formalIndex]
  const categoryName = (category: Category) => category === 'blue-circle' ? (en ? 'Blue circle' : '蓝圆') : (en ? 'Orange triangle' : '橙三角')
  const ruleName = (rule: string) => rule === 'fixed' ? (en ? 'Fixed reward' : '固定奖励') : (en ? 'Decreasing reward' : '递减奖励')
  const ruleText = (rule: string) => rule === 'fixed' ? (en ? 'Correct +100, incorrect −100; opening tiles does not reduce the correct reward.' : '答对+100、答错−100；揭格不减少正确奖励。') : (en ? 'Correct 250 minus 10 per opened tile; incorrect always −100.' : '答对250减去每个已揭格的10点；答错始终−100。')
  const begin = () => { if (starting.current !== null) cancelAnimationFrame(starting.current); starting.current = requestAnimationFrame(() => { starting.current = null; if (alive.current && !invalid.current) flushSync(() => s.begin(performance.now())) }) }
  const controls = (target: string) => {
    const send = (kind: IstActivation['kind'], input: Input, token: string, key: string | null, repeat = false) => { if (alive.current && !invalid.current && s.capture) s.input({ kind, atMs: performance.now(), target, input, token, key, repeat }) }
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.button !== 0) return; e.preventDefault(); send('down', e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse', 'pointer:' + e.pointerId, null) },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); send('up', e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse', 'pointer:' + e.pointerId, null) },
      onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); send('cancel', e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse', 'pointer:' + e.pointerId, null) },
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) send('activate', 'assistive', 'assistive', null) },
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.altKey || e.ctrlKey || e.metaKey || !['Enter', ' '].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const key = e.code || (e.key === ' ' ? 'Space' : 'Enter'); send('down', 'keyboard', 'key:' + key, key, e.repeat) },
      onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => { if (!['Enter', ' '].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const key = e.code || (e.key === ' ' ? 'Space' : 'Enter'); send('up', 'keyboard', 'key:' + key, key) },
    }
  }
  const moveFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])], at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault(); const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -5 : 5; buttons[(at + delta + 25) % 25]?.focus()
  }
  const endPractice = <button className="ist-secondary" onClick={() => s.endPractice()}>{en ? 'End practice' : '结束练习'}</button>
  return <main className="ist-root ist-reading" data-ist-view={view}>
    {(view === 'intro' || view === 'practice-instructions') && <><IstInstructions config={c} language={language} /><button onClick={() => view === 'intro' ? void s.prepare() : begin()}>{view === 'intro' ? (en ? 'Prepare practice' : '准备练习') : (en ? 'Start next practice group' : '开始下一组练习')}</button>{endPractice}</>}
    {['practice-ready', 'formal-ready', 'game-ready', 'break'].includes(view) && <><h1>{view === 'practice-ready' ? (en ? 'Two easy practice rounds' : '准备2轮容易练习') : view === 'break' ? (en ? 'Pause and review the new rule' : '休息一下，了解下一种规则') : view === 'formal-ready' ? (en ? 'Ready for formal rounds' : '准备正式任务') : (en ? 'Ready for the next round' : '准备下一局')}</h1><h2>{ruleName(view === 'practice-ready' ? 'fixed' : next?.rule ?? 'fixed')}</h2><p>{ruleText(view === 'practice-ready' ? 'fixed' : next?.rule ?? 'fixed')}</p><p>{view === 'practice-ready' ? (en ? 'Complete both judgments and then three rule questions. Sampling preference and points do not determine practice progression.' : '完成两次判断，再答3道理解题。不按采样偏好或点数决定是否通过。') : (en ? `${s.formalIndex}/${c.totalTrials} rounds recorded. Continue when ready; there is no response deadline.` : `已记录${s.formalIndex}/${c.totalTrials}局，准备好后继续；没有作答倒计时。`)}</p><button onClick={begin}>{en ? 'Start round' : '开始本局'}</button><button className="ist-secondary" onClick={() => s.phase === 'test' ? s.stop('participant-ended', performance.now()) : s.endPractice()}>{en ? 'End this attempt' : '结束本次记录'}</button></>}
    {view === 'running' && p && state && <><h1>{s.phase === 'practice' ? (en ? `Practice ${s.practiceIndex + 1}/2` : `练习第${s.practiceIndex + 1}/2局`) : (en ? `Round ${s.formalIndex + 1}/${c.totalTrials}` : `第${s.formalIndex + 1}/${c.totalTrials}局`)} · {ruleName(p.rule)}</h1><p>{ruleText(p.rule)}</p><p>{en ? 'Which type is more common on the whole board?' : '整个棋盘哪一类更多？'} {state.stage === 'sampling' ? (en ? `${state.reveals.length}/25 opened` : `已揭${state.reveals.length}/25格`) : ''}</p>
      <div className="ist-grid" ref={gridRef} role="group" aria-label={en ? '25-tile board' : '25格棋盘'} onKeyDown={moveFocus}>{p.board.map((category, cell) => {
        const reveal = state.reveals.find(x => x.cell === cell), shown = state.stage === 'sampling' ? reveal?.category : category
        return <button key={cell} className="ist-tile" disabled={state.stage !== 'sampling'} aria-disabled={!!shown || state.stage !== 'sampling'} aria-label={`${en ? 'Tile' : '格子'}${cell + 1} ${shown ? categoryName(shown) : (en ? 'unopened' : '未打开')}`} {...controls('cell:' + cell)}>{shown ? <span aria-hidden="true" className={shown === 'blue-circle' ? 'ist-circle' : 'ist-triangle'} /> : <span aria-hidden="true">?</span>}</button>
      })}</div>
      {state.stage === 'sampling' ? <><div className="ist-note">{en ? 'If correct now' : '此时答对'}：{p.rule === 'fixed' ? 100 : 250 - 10 * state.reveals.length}{en ? ' points; an incorrect choice is always −100.' : '点；答错始终−100。'}</div><div className="ist-choices">{p.optionOrder.map(category => <button key={category} {...controls('choice:' + category)} aria-label={(en ? 'Choose ' : '选择') + categoryName(category)}><span aria-hidden="true">{category === 'blue-circle' ? '●' : '▲'}</span> {categoryName(category)}{en ? ' majority' : '更多'}</button>)}</div></> : <p role="status">{state.decision?.correct ? (en ? 'Correct' : '判断正确') : (en ? 'Incorrect' : '判断不正确')} · {en ? 'Whole-board majority' : '全盘多数'}：{categoryName(p.majority)}；{en ? 'points' : '点数'} {state.decision?.points}。{en ? 'Full board and result are shown for two seconds.' : '全盘和结果显示2秒。'}</p>}
      {s.phase === 'practice' && <p className="ist-note">{en ? 'Practice has a clearer majority. Open a tile if you wish, then judge the whole board; no required sampling amount. The next questions check the rules, not your preferred strategy.' : '练习多数更明显。可以揭格查看，再判断全盘；没有必须揭几格的要求。后续理解题考查规则，不评价偏好策略。'}</p>}<button className="ist-secondary" onClick={() => s.stop('participant-ended', performance.now())}>{en ? 'Stop this round' : '停止本局'}</button></>}
    {view === 'practice-feedback' && <><h1>{s.practiceFailed ? (en ? 'This practice round was not completed' : '这局练习尚未完成') : (en ? 'Practice judgment recorded' : '练习判断已记录')}</h1><p>{en ? `${s.practiceIndex}/2 practice records saved in this group. Neither points nor sampling preference determines progression.` : `本组已保存${s.practiceIndex}/2局练习。通过不看点数或采样偏好。`}</p>{s.practiceFailed ? <>{!s.canRetryPractice && <IstInstructions config={c} language={language} />}{s.canRetryPractice ? <button onClick={() => s.reviewInstructions()}>{en ? 'Read full instructions and example again' : '重新阅读完整说明与例子'}</button> : <p>{en ? 'Three groups have been attempted. You may stop and ask the organiser for help.' : '已尝试3组，可先结束并向组织者询问。'}</p>}</> : s.practiceIndex === 2 ? <button onClick={() => s.beginQuiz(performance.now())}>{en ? 'Check the three rules' : '回答3道理解题'}</button> : <button onClick={() => s.nextPractice(performance.now())}>{en ? 'Next practice round' : '下一局练习'}</button>}{endPractice}</>}
    {view === 'quiz' && s.quiz && <><h1>{en ? 'Three rule questions' : '3道规则理解题'}</h1>{IST_QUESTIONS[language].map((q, i) => <fieldset key={i}><legend>{q.question}</legend>{q.options.map((option, j) => <label className="ist-radio" key={option}><input type="radio" name={'ist-quiz-' + i} checked={s.quiz?.answers[i] === j} onChange={() => s.answerQuiz(i, j)} />{option}</label>)}</fieldset>)}<button disabled={s.quiz.answers.some(x => x === null)} onClick={() => s.submitQuiz(performance.now())}>{en ? 'Confirm rule answers' : '确认理解题答案'}</button>{endPractice}</>}
    {view === 'quiz-feedback' && <><h1>{s.practicePassed ? (en ? 'Rules understood' : '规则已理解') : (en ? 'Review the rules before continuing' : '先重新了解规则')}</h1><p>{s.practicePassed ? (en ? 'Both practice judgments and all three rule questions are complete. This is a teaching check, not an ability score.' : '已完成两轮练习与全部3道理解题。这是教学检查，不是能力分。') : (en ? 'Judge the whole board. Fixed correct choices earn 100; decreasing correct choices after seven tiles earn 180. No sampling preference is required.' : '要判断整个棋盘；固定规则答对100点；递减规则揭7格后答对180点。不要求特定采样偏好。')}</p>{s.practicePassed ? <button onClick={() => s.acceptPractice()}>{en ? 'Prepare formal task' : '准备正式任务'}</button> : s.canRetryPractice ? <button onClick={() => s.reviewInstructions()}>{en ? 'Read full instructions and example again' : '重新阅读完整说明与例子'}</button> : <><IstInstructions config={c} language={language} /><p>{en ? 'Three practice groups have been attempted. Stop and ask the organiser for help.' : '已尝试3组练习，可先结束并向组织者询问。'}</p></>}{endPractice}</>}
    {['preparing', 'saving-item', 'saving-final'].includes(view) && <p role="status">{en ? 'Confirming that the record was saved…' : '正在确认记录已保存…'}</p>}
    {view === 'retry' && <><h1>{en ? 'Presentation has stopped' : '呈现已停止'}</h1><p>{en ? 'Keep this page. Retry saves the same record without replaying a board. Report saving and full original-record archival are separate; closing does not guarantee a background upload.' : '请保留本页。重试只保存同一份记录，不重新呈现棋盘。报告保存与完整原件归档分别确认，关页不保证后台上传。'}</p><button onClick={() => void s.retry()}>{en ? 'Retry saving' : '重试保存'}</button></>}
    {view === 'stopped' && <><h1>{en ? 'Practice has ended' : '本次练习已结束'}</h1><p>{en ? 'No formal result was completed. This is not an ability judgment.' : '尚未完成正式测量，这不是能力判断。'}</p></>}
    {view === 'blocked' && <p role="alert">{en ? 'A fresh saved attempt was not confirmed. No board has started.' : '尚未确认新的耐久作答身份，没有开始棋盘。'}</p>}
  </main>
}

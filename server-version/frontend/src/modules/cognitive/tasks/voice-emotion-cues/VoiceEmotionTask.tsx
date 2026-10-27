import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { VoiceSession } from './session'
import { digest, type Context, type Ports } from './contracts'
import { EMOTIONS, asset, observe, type Choice, type Input } from './generated/protocol'
import { VoiceInstructions, label } from './VoiceInstructions'
import { VoiceReport } from './VoiceReport'
import { loadVoice, type MediaLoader, type LoadedVoice } from './assets'
import './voice.css'
export interface VoiceEmotionTaskProps { context: Context; ports: Ports; language?: 'zh' | 'en'; mediaLoader?: MediaLoader }
/** Independent candidate. Product registration and durable ports are not wired. */
export function VoiceEmotionTask({ context, ports, language = context.language, mediaLoader = loadVoice }: VoiceEmotionTaskProps) {
  const [, redraw] = useReducer(n => n + 1, 0), alive = useRef(true), initial = useRef({ binding: digest(context), ports, language, mediaLoader }), invalid = useRef(false)
  const [holder] = useState(() => { try { return { session: new VoiceSession(context, ports, () => { if (alive.current) redraw() }) } } catch { return { session: null } } })
  const s = holder.session, en = language === 'en', audio = useRef<HTMLAudioElement | null>(null), [loaded, setLoaded] = useState<LoadedVoice | null>(null), [mediaError, setMediaError] = useState(''), [loadAttempt, setLoadAttempt] = useState(0)
  const setAudio = useCallback((node: HTMLAudioElement | null) => { if (audio.current && audio.current !== node) audio.current.pause(); audio.current = node }, [])
  const cap = s?.capture, view = s?.view
  if (language !== context.language || initial.current.binding !== digest(context) || initial.current.ports !== ports || initial.current.language !== language || initial.current.mediaLoader !== mediaLoader) invalid.current = true
  useEffect(() => { alive.current = true; return () => { alive.current = false; queueMicrotask(() => { if (!alive.current) s?.dispose() }) } }, [s])
  useEffect(() => { if (invalid.current) s?.dispose() }, [s, context, ports, language, mediaLoader])
  useEffect(() => {
    if (!s || !cap || invalid.current) return
    const controller = new AbortController(); let loadedItem: LoadedVoice | null = null
    setLoaded(null); setMediaError('')
    mediaLoader(cap.plan, controller.signal).then(item => {
      if (controller.signal.aborted || invalid.current || !alive.current || s.capture !== cap) { item.dispose(); return }
      if (item.sha256 !== asset(cap.plan.assetId).sha256) { item.dispose(); throw Error('Wrong audio asset') }
      loadedItem = item; setLoaded(item)
    }).catch(() => { if (!controller.signal.aborted && alive.current && s.capture === cap) setMediaError(en ? 'The recording is not ready. Retry loading, skip or end; nothing has played.' : '录音尚未就绪，可重试加载、跳过或结束；尚未播放。') })
    return () => { controller.abort(); if (audio.current && !audio.current.paused) audio.current.pause(); loadedItem?.dispose() }
  }, [s, cap, mediaLoader, loadAttempt, en])
  useEffect(() => {
    if (!s || !cap || invalid.current) return
    const hidden = () => { if (document.hidden) s.event({ kind: 'interrupt', at: performance.now(), reason: 'hidden' }) }
    const pagehide = () => s.stop('pagehide')
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide)
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide) }
  }, [s, cap])
  if (!s || invalid.current) return <section className="voice-task" role="alert">{en ? 'This frozen attempt cannot continue. Keep this page and contact the organiser.' : '本次冻结作答无法继续，请保留页面并联系组织者。'}</section>
  if (view === 'report' && s.receipt) return <VoiceReport report={s.receipt.report} language={language} />
  const send = (kind: 'down' | 'up' | 'cancel', choice: Choice, token: string, input: Input) => s.event({ kind, choice, token, input, at: performance.now() })
  const controls = (choice: Choice) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.button !== 0 || view !== 'answer') return; send('down', choice, 'pointer:' + e.pointerId, e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse') },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.button !== 0 || view !== 'answer') return; send('up', choice, 'pointer:' + e.pointerId, e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse') },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => send('cancel', choice, 'pointer:' + e.pointerId, e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse'),
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.buttons) send('cancel', choice, 'pointer:' + e.pointerId, e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse') },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => { if (!['Enter', ' '].includes(e.key)) return; e.preventDefault(); if (!e.repeat) send('down', choice, 'key:' + (e.code || e.key), 'keyboard') },
    onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => { if (!['Enter', ' '].includes(e.key)) return; e.preventDefault(); send('up', choice, 'key:' + (e.code || e.key), 'keyboard') },
    onBlur: () => { for (const key of ['Enter', 'Space', ' ']) send('cancel', choice, 'key:' + key, 'keyboard') },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => { if (e.detail === 0 && view === 'answer') s.event({ kind: 'activate', choice, input: 'assistive', at: performance.now() }) },
  })
  const begin = () => s.begin(), interrupt = (reason: string) => { if (s.capture) s.event({ kind: 'interrupt', reason, at: performance.now() }) }
  return <main className="voice-task" lang={language === 'zh' ? 'zh-CN' : 'en'} data-view={view}>
    {(view === 'intro' || view === 'practice-instructions') && <><VoiceInstructions language={language} config={s.context.snapshot.config} /><button onClick={() => view === 'intro' ? void s.prepare() : s.finishInstructions()}>{en ? 'I have read the instructions; prepare practice' : '阅读完毕，准备练习'}</button></>}
    {['practice-ready', 'formal-ready', 'break'].includes(view!) && <><h1>{view === 'practice-ready' ? (en ? 'Ready for practice' : '准备练习') : view === 'break' ? (en ? 'Take a break' : '休息一下') : (en ? 'Ready for the next clip' : '准备下一段')}</h1><p>{en ? 'Start when you are ready. Select Play voice on the next screen.' : '准备好后开始，在下一页点“播放语音”。'}</p><button onClick={begin}>{en ? 'Start' : '开始'}</button></>}
    {cap && ['ready', 'playing', 'answer'].includes(view!) && <>
      <h1>{en ? 'Listen first, then choose an expression' : '先听声音，再选择表达'}</h1>
      <p>{en ? 'You do not need to rush.' : '不必抢快。'}</p>
      {loaded && <audio ref={setAudio} src={loaded.url} preload="auto" controls={false} onPlaying={() => s.event({ kind: 'play', at: performance.now() })} onEnded={() => s.event({ kind: 'ended', at: performance.now() })} onError={() => { if (s.view === 'ready') setMediaError(en ? 'Playback could not start. You may try Play voice again.' : '尚未开始播放，可以再次点播放语音。'); else interrupt('media-error') }} onPause={e => { if (s.view === 'playing' && !e.currentTarget.ended) interrupt('media-paused') }} onSeeking={() => { if (s.view === 'playing') interrupt('media-seek') }} onRateChange={e => { if (e.currentTarget.playbackRate !== 1) interrupt('media-rate') }} />}
      {view === 'ready' && <button disabled={!loaded} onClick={() => { setMediaError(''); void audio.current?.play().catch(() => { if (s.view === 'ready') setMediaError(en ? 'Playback did not start. Select Play voice again, skip or end.' : '尚未开始播放，请再次点播放语音，或跳过、结束。'); else interrupt('media-error') }) }}>{loaded ? (en ? 'Play voice' : '播放语音') : (en ? 'Loading recording…' : '正在加载录音…')}</button>}
      {view === 'playing' && <p role="status">{en ? 'Listen to the complete clip once…' : '请完整听一次…'}</p>}
      {view === 'answer' && <p role="status">{en ? 'Playback finished. Choose the closest expression.' : '语音已结束，请选择更接近的表达。'}</p>}
      {mediaError && <><p role="alert">{mediaError}</p><button onClick={() => setLoadAttempt(n => n + 1)}>{en ? 'Retry loading' : '重试加载'}</button></>}
      <div className="voice-choices">{([...EMOTIONS, 'none'] as const).map(choice => <button key={choice} className={choice === 'none' ? 'voice-wide' : ''} disabled={view !== 'answer'} {...controls(choice)}>{label(choice, en)}</button>)}</div>
      <button className="voice-secondary" onClick={() => s.event({ kind: 'skip', at: performance.now() })}>{en ? 'Skip this clip' : '跳过本段'}</button>
    </>}
    {view === 'feedback' && s.last && <><h1>{en ? 'Practice explanation' : '练习解释'}</h1><p>{en ? 'Target label' : '目标标签'}：{label(s.last.plan.emotion, en)}</p><p>{en ? 'Your choice' : '你的选择'}：{observe(s.last).choice ? label(observe(s.last).choice!, en) : (en ? 'No usable response' : '没有可用答案')}</p><p>{en ? 'These labels compare the intended expression, not actual feelings.' : '这里只比较表达目标标签，不判断真实内心。'}</p>
      {s.index < 3 ? <button onClick={() => s.nextPractice()}>{en ? 'Next practice clip' : '下一次练习'}</button> : s.practicePassed ? <button onClick={() => s.startFormal()}>{en ? 'Prepare formal task' : '准备正式任务'}</button> : s.round < 1 ? <button onClick={() => s.retryInstructions()}>{en ? 'Read the full instructions and example again' : '重新阅读完整说明与例子'}</button> : <p>{en ? 'Two practice groups are finished. You may end and ask the organiser for help.' : '两组练习已结束，可以先结束并向组织者询问。'}</p>}</>}
    {['preparing', 'saving', 'finalizing'].includes(view!) && <p role="status">{en ? 'Confirming your record…' : '正在确认记录…'}</p>}
    {view === 'retry' && <><h1>{en ? 'Saving is not confirmed' : '保存尚未确认'}</h1><p>{en ? 'Keep this page. Retry the same record; no recording will replay. Closing this page does not guarantee upload.' : '请保留本页，重试同一份记录，不重播录音；关闭页面不保证上传成功。'}</p><button onClick={() => void s.retry()}>{en ? 'Retry saving' : '重试保存'}</button></>}
    {view === 'blocked' && <p role="alert">{en ? 'An exclusive durable attempt could not be confirmed. No clip has played.' : '尚未确认独占的耐久作答身份，没有播放录音。'}</p>}
    {view === 'stopped' && <p>{en ? 'Practice has ended. No formal performance score was produced.' : '本次练习已结束，没有生成正式表现分数。'}</p>}
    {!['report', 'stopped', 'blocked', 'finalizing'].includes(view!) && <button className="voice-secondary" onClick={() => s.stop()}>{en ? 'End this attempt' : '结束本次记录'}</button>}
    <footer className="voice-note">{en ? 'Recordings: Livingstone & Russo, RAVDESS 1.0.0, CC BY-NC-SA 4.0. Noncommercial research candidate.' : '录音：Livingstone与Russo，RAVDESS 1.0.0，CC BY-NC-SA 4.0。非商业科研候选。'} <a href="https://zenodo.org/records/1188976">{en ? 'Source' : '来源'}</a> · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">{en ? 'License' : '许可'}</a></footer>
  </main>
}

import React from 'react'
import { isPublicReport, reportText } from './generated/report'
export function VoiceReport({ report, language = 'zh' }: { report: unknown; language?: 'zh' | 'en' }) {
  const en = language === 'en'
  if (!isPublicReport(report)) return <section role="alert">{en ? 'This report cannot be verified. No performance is shown.' : '无法核对本次报告，暂不展示表现。'}</section>
  const text = reportText(report, language)
  const download = () => {
    if (report.state === 'invalid') return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a')
    a.href = url; a.download = 'voice-emotion-cues-report.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return <section className="voice-task voice-report" data-quality={report.state}>
    <p>{en ? 'This attempt’s report' : '本次记录报告'} · {report.profile}</p>
    {text.split('\n\n').map((line, i) => i === 0 ? <h1 key={i}>{line}</h1> : <p key={i}>{line}</p>)}
    {report.state !== 'invalid' && <button onClick={download}>{en ? 'Download these same permitted details' : '下载同一份可披露记录'}</button>}
    <p className="voice-note">{en ? 'Core/report saving was confirmed. Complete original-record archival has a separate status; this screen does not confirm it.' : '核心记录与报告保存已获回执。完整原件归档另有状态，本页不代表归档成功。'}</p>
    <footer>EDUK12.TOP</footer>
  </section>
}

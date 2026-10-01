import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import CognitiveV2ReportCard from '../../frontend/src/modules/cognitive/CognitiveV2ReportCard'
import type { CognitiveV2Report } from '../../frontend/src/modules/cognitive/types'
import CognitiveProfessionalReport from '../../frontend/src/modules/cognitive/CognitiveProfessionalReport'

const corpus = JSON.parse(document.getElementById('preview-data')!.textContent!) as Array<{ key: string; label: string; report: CognitiveV2Report }>
function Preview() {
  const [key, setKey] = useState(corpus[0].key)
  const [audience, setAudience] = useState('participant')
  const sample = corpus.find(item => item.key === key)!
  return <><div className="preview-toolbar"><label>模拟作答 · 实际评分与报告组件 <select aria-label="选择报告样例" value={key} onChange={event => setKey(event.target.value)}>{corpus.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label><label>阅读版本 <select aria-label="选择阅读版本" value={audience} onChange={event => setAudience(event.target.value)}><option value="participant">个体科普版</option><option value="professional">后台专业版</option></select></label></div>{audience === 'professional' ? <CognitiveProfessionalReport key={key} report={sample.report} recordLabel="模拟记录 · 第 1 次" reportId={`CR-DEMO-${key}`} assignmentTitle="本地报告验收 · 合成任务" finishedAt="2026-10-01T08:30:00Z" /> : <CognitiveV2ReportCard key={key} report={sample.report} anonymousCode="DEMO-2026-0001" attemptNo={1} finishedAt="2026-10-01T08:30:00Z" />}<p className="preview-footer">本地开发验收 · 合成数据 · 非真实学生报告 · 不连接业务 API</p></>
}
createRoot(document.getElementById('root')!).render(<Preview />)

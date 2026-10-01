import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import CognitiveV2ReportCard from '../../frontend/src/modules/cognitive/CognitiveV2ReportCard'
import type { CognitiveV2Report } from '../../frontend/src/modules/cognitive/types'

const corpus = JSON.parse(document.getElementById('preview-data')!.textContent!) as Array<{ key: string; label: string; report: CognitiveV2Report }>
function Preview() {
  const [key, setKey] = useState(corpus[0].key)
  const sample = corpus.find(item => item.key === key)!
  return <><div className="preview-toolbar"><label>模拟作答 · 实际评分与报告组件 <select aria-label="选择报告样例" value={key} onChange={event => setKey(event.target.value)}>{corpus.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label></div><CognitiveV2ReportCard key={key} report={sample.report} /><p className="preview-footer">本地开发验收 · 合成数据 · 非真实学生报告 · 不连接业务 API</p></>
}
createRoot(document.getElementById('root')!).render(<Preview />)

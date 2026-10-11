import { useEffect,useState,type FormEvent } from 'react'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type WaveSummary={id:string;ordinal:number;title:string;status:string;
  starts:number;finalCompleted:number;analysisIncluded:number;qualityExcluded:number;
  uniqueLinkedCodes:number|null;excluded:number}
type Overview={projectId:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';source:string;note:string;waves:WaveSummary[]}
type Matched={baselineN:number;followupN:number;matchedN:number;attritionN:number;lateJoinN:number;note:string}
type ScoreStat={instrumentKey:string;scoreKey:string;validN:number;mean:number|null;sampleSd:number|null}
type ItemStat={itemKey:string;instrumentKey:string;prompt:string;kind:string;respondentN:number;
  missingByReason:Record<string,number>;frequencies:{value:string;count:number}[];
  combinationFrequencies?:{value:string;count:number}[];responseType?:string;
  numericMean:number|null;numericSampleSd:number|null}
type WaveItems={waveId:string;items:ItemStat[];descriptiveScores:ScoreStat[];note:string}
type BoundedVariable={instrumentKey:string;itemKey:string;prompt:string;
  responseType:string;columnKey:string;kind:string}
type BoundedItem={analysisFinalCount:number;respondentN:number;prompt:string;
  itemKey:string;instrumentKey:string;responseType:string;
  frequencies:{value:string;count:number}[];missingByReason:Record<string,number>;
  numericMean:number|null;numericSampleSd:number|null;
  complete:true;sourceCutOff:string;note:string}
type PairedScore={baselineN:number;followupN:number;matchedN:number;attritionN:number;lateJoinN:number;
  meanPairedChange:number|null;comparability:'COMPARABLE'|'NOT_COMPARABLE';reason?:string}
type GroupResult={minGroupN:number;suppressedGroups:number;note:string;groups:Array<{
  optionCode:string;optionLabel:string;respondentN:number;scoreValidN:number;
  mean:number|null;sampleSd:number|null
}>}
type QualityRow={attemptId:string;attemptCode:string;researchCode:string|null;waveId:string;
  completedAt:string;verdict:'INCLUDED'|'EXCLUDED';reason:string|null;revision:number}
type QualityAudit={reviewedAt:string;reviewerId:string|null;previousVerdict:'INCLUDED'|'EXCLUDED';
  verdict:'INCLUDED'|'EXCLUDED';reason:string;revision:number}
type ExportFormat='RAW_WAVE'|'RAW_LONG'|'RAW_WIDE'|'SCORE_LONG'|'SCORE_WIDE'
type Ticket={id:string;status:'READY';format:ExportFormat;expiresAt:string;
  nextCursor:string|null;pageNumber:number|null;
  manifest:{rowCount:number;columnCount:number}}
type Artifact={id:string;format:ExportFormat;csv:string;codebook:unknown;manifest:unknown}
const kindOptions:Record<ExportFormat,string>={
  RAW_WAVE:'单波次逐题原始数据',
  RAW_LONG:'全部波次逐题 Long',
  RAW_WIDE:'同编号逐题 Wide',
  SCORE_LONG:'全部波次探索性得分 Long',
  SCORE_WIDE:'同编号探索性得分 Wide',
}
async function api<T>(endpoint:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=document.cookie.split('; ').find(x=>x.startsWith('huisurvey_research_csrf='))
      ?.split('=').slice(1).join('=')||''
    if(!csrf){
      const r=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      if(!r.ok)throw new Error('未能获取安全校验')
      const data=await r.json() as ApiResult<{csrfToken:string}>
      csrf=data.data?.csrfToken||''
    }
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const response=await fetch('/api/survey'+endpoint,{
    method,credentials:'same-origin',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const result=await response.json() as ApiResult<T>
  if(!response.ok||result.code!==0||result.data===null)
    throw new Error(result.message||'操作失败')
  return result.data
}
const downloadBlob=(filename:string,value:string,mime:string)=>{
  const blob=new Blob([value],{type:mime})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url;anchor.download=filename
  document.body.append(anchor);anchor.click();anchor.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),3000)
}
export function SurveyAnalyticsWorkspace({projectId}:{projectId:string}){
  const [overview,setOverview]=useState<Overview|null>(null)
  const [baseline,setBaseline]=useState(''),[followup,setFollowup]=useState('')
  const [paired,setPaired]=useState<Matched|null>(null)
  const [itemStats,setItemStats]=useState<WaveItems|null>(null)
  const [boundedVariables,setBoundedVariables]=useState<BoundedVariable[]>([])
  const [boundedItemKey,setBoundedItemKey]=useState('')
  const [boundedItem,setBoundedItem]=useState<BoundedItem|null>(null)
  const [metricKey,setMetricKey]=useState(''),[metricInstrument,setMetricInstrument]=useState('')
  const [pairedScore,setPairedScore]=useState<PairedScore|null>(null)
  const [groupItem,setGroupItem]=useState(''),[groupScore,setGroupScore]=useState('')
  const [groupResult,setGroupResult]=useState<GroupResult|null>(null)
  const [format,setFormat]=useState<ExportFormat>('RAW_WAVE'),[waveId,setWaveId]=useState('')
  const [exportWaveId,setExportWaveId]=useState(''),[batchDownloaded,setBatchDownloaded]=useState(false)
  const [completedFrom,setCompletedFrom]=useState(''),[completedBefore,setCompletedBefore]=useState('')
  const [otp,setOtp]=useState(''),[busy,setBusy]=useState(false)
  const [includeFreeText,setIncludeFreeText]=useState(false),[message,setMessage]=useState('')
  const [error,setError]=useState(''),[ticket,setTicket]=useState<Ticket|null>(null)
  const [qualityRows,setQualityRows]=useState<QualityRow[]>([])
  const [qualityPage,setQualityPage]=useState(1)
  const [qualityReason,setQualityReason]=useState('')
  const [qualityHistory,setQualityHistory]=useState<{
    attemptId:string;page:number;list:QualityAudit[]
  }|null>(null)
  const base='/projects/'+projectId
  const reload=async()=>{
    const res=await api<Overview>(base+'/analytics/overview')
    setOverview(res)
    const ordered=res.waves
    if(ordered[0]){setWaveId(ordered[0].id);setBaseline(ordered[0].id)}
    if(ordered[1])setFollowup(ordered[1].id)
    setItemStats(null);setPairedScore(null);setGroupResult(null);setGroupItem('');setGroupScore('')
    setBoundedVariables([]);setBoundedItemKey('');setBoundedItem(null)
  }
  useEffect(()=>{
    setOverview(null);setError('');setTicket(null);setPaired(null)
    setQualityRows([]);setQualityPage(1)
    void Promise.all([reload(),loadQuality(1)])
      .catch(e=>setError(e instanceof Error?e.message:'研究分析尚不可用'))
  },[projectId])
  const execute=async(fn:()=>Promise<void>)=>{
    setBusy(true);setError('');setMessage('')
    try{await fn()}catch(e){setError(e instanceof Error?e.message:'请求未完成')}finally{setBusy(false)}
  }
  const loadQuality=async(page=qualityPage)=>{
    const data=await api<{list:QualityRow[]}>(base+'/analytics/quality/attempts?page='+page)
    setQualityRows(data.list);setQualityPage(page);setQualityHistory(null)
  }
  const openQualityHistory=(row:QualityRow,page=1)=>void execute(async()=>{
    const data=await api<{list:QualityAudit[];page:number}>(
      base+'/analytics/quality/attempts/'+row.attemptId+'/history?page='+page)
    setQualityHistory({attemptId:row.attemptId,page:data.page,list:data.list})
  })
  const markQuality=(row:QualityRow,verdict:'INCLUDED'|'EXCLUDED')=>{
    if(qualityReason.trim().length<2)return
    if(!window.confirm(verdict==='EXCLUDED'
      ?'该决定会把此份 FINAL 从后续有效样本分析排除，但不删除原始答卷。确认？'
      :'确认将该份记录重新纳入有效分析？原始 FINAL 保持不变。'))return
    void execute(async()=>{
      await api(base+'/analytics/quality/attempts/'+row.attemptId,'POST',{
        revision:row.revision,verdict,reason:qualityReason.trim(),
      })
      setQualityReason('')
      await Promise.all([reload(),loadQuality(qualityPage)])
      setMessage('样本质量决定已记录审计，旧的未下载导出已失效。')
    })
  }
  const compare=()=>void execute(async()=>{
    setPaired(await api<Matched>(base+'/analytics/paired-counts','POST',{
      baselineWaveId:baseline,followupWaveId:followup,
    }))
  })
  const loadItems=()=>void execute(async()=>{
    const result=await api<WaveItems>(base+'/analytics/waves/'+waveId+'/items')
    setItemStats(result);setPairedScore(null);setGroupResult(null)
    if(result.descriptiveScores[0]){
      setMetricKey(result.descriptiveScores[0].scoreKey)
      setMetricInstrument(result.descriptiveScores[0].instrumentKey)
    }
  })
  const openBoundedDictionary=()=>void execute(async()=>{
    const result=await api<{variables:BoundedVariable[]}>(
      base+'/analytics/waves/'+waveId+'/items/dictionary')
    setBoundedVariables(result.variables)
    setBoundedItemKey(result.variables[0]?.columnKey??'')
    setBoundedItem(null)
    setMessage('已读取该波次冻结的变量字典。单题可处理最多 6000 份有效 FINAL，超过会明确报错。')
  })
  const loadBoundedItem=()=>void execute(async()=>{
    const variable=boundedVariables.find(v=>v.columnKey===boundedItemKey)
    if(!variable)throw new Error('请先选择一个冻结研究变量')
    const result=await api<BoundedItem>(
      base+'/analytics/waves/'+waveId+'/items/paged','POST',{
        instrumentKey:variable.instrumentKey,itemKey:variable.itemKey,
      })
    setBoundedItem(result)
  })
  const compareScore=()=>void execute(async()=>{
    const score=await api<PairedScore>(base+'/analytics/paired-scores','POST',{
      baselineWaveId:baseline,followupWaveId:followup,
      instrumentKey:metricInstrument,scoreKey:metricKey,
    })
    setPairedScore(score)
  })
  const compareGroups=()=>void execute(async()=>{
    const [groupInstrumentKey,groupItemKey]=groupItem.split(':')
    const [scoreInstrumentKey,scoreKey]=groupScore.split(':')
    const result=await api<GroupResult>(base+'/analytics/waves/'+waveId+'/group-scores','POST',{
      groupInstrumentKey,groupItemKey,scoreInstrumentKey,scoreKey,
    })
    setGroupResult(result)
  })
  const stepUp=(e:FormEvent)=>{e.preventDefault();void execute(async()=>{
    await api('/auth/mfa/step-up','POST',{code:otp.trim()})
    setOtp('');setMessage('已完成最新 TOTP 二次认证；敏感导出仅在接下来的五分钟内有效。')
  })}
  const createExport=(cursor?:string)=>void execute(async()=>{
    const result=await api<Ticket>(base+'/exports','POST',{
      format,...(format==='RAW_WAVE'?{waveId}:
        (['RAW_LONG','SCORE_LONG'].includes(format)&&exportWaveId?{waveId:exportWaveId}:{})),
      ...(format.startsWith('RAW')?{includeFreeText}:{}),
      ...(format==='RAW_WAVE'?{
        ...(completedFrom?{completedFrom:new Date(completedFrom).toISOString()}:{}),
        ...(completedBefore?{completedBefore:new Date(completedBefore).toISOString()}:{}),
      }:{}),
      ...(cursor?{cursor}:{}),
    })
    setTicket(result);setBatchDownloaded(false)
    setMessage('第 '+(result.pageNumber||1)+' 批加密数据已生成；逐批下载并保留 Manifest。')
  })
  const download=()=>{if(!ticket)return;void execute(async()=>{
    const artifact=await api<Artifact>(base+'/exports/'+ticket.id+'/download')
    const batchLabel=String(ticket.pageNumber??1).padStart(3,'0')
    const baseName='survey_'+projectId.slice(0,8)+'_'+artifact.format.toLowerCase()
      +'_batch'+batchLabel+'_'+ticket.id.slice(0,8)
    downloadBlob(baseName+'.csv','\uFEFF'+artifact.csv,'text/csv;charset=utf-8')
    downloadBlob(baseName+'_codebook.json',JSON.stringify(artifact.codebook,null,2),'application/json;charset=utf-8')
    downloadBlob(baseName+'_manifest.json',JSON.stringify(artifact.manifest,null,2),'application/json;charset=utf-8')
    setBatchDownloaded(true)
    setMessage('已下载当前批次 CSV、变量编码字典和 Manifest，请保管敏感数据。')
  })}
  return <section className="border rounded-xl bg-white p-4 sm:p-6 my-5 space-y-4" aria-label="研究数据">
    <header><h2 className="text-xl font-semibold">研究数据 · Wave Analytics</h2>
      <p className="text-sm text-slate-600">完成与配对统计只来源于可核对的加密 Survey FINAL；研究编号数不等于经过实名验证的自然人数。</p></header>
    {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
    {message&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{message}</p>}
    <button className="btn-secondary" disabled={busy} onClick={()=>void execute(reload)}>刷新完成进度</button>
    {overview&&<><div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
      <thead><tr className="bg-slate-100"><th className="p-2 text-left">波次</th><th className="p-2">状态</th>
        <th className="p-2">已启动</th><th className="p-2">完成 FINAL</th>
        <th className="p-2">有效分析</th><th className="p-2">质量排除</th>
        <th className="p-2">研究编号数</th><th className="p-2">撤回排除</th></tr></thead>
      <tbody>{overview.waves.map(w=><tr key={w.id} className="border-b">
        <th scope="row" className="p-2 text-left">T{w.ordinal} · {w.title}</th><td className="p-2 text-center">{w.status}</td>
        <td className="p-2 text-center">{w.starts}</td><td className="p-2 text-center">{w.finalCompleted}</td>
        <td className="p-2 text-center">{w.analysisIncluded}</td>
        <td className="p-2 text-center">{w.qualityExcluded}</td>
        <td className="p-2 text-center">{w.uniqueLinkedCodes??'不可关联'}</td>
        <td className="p-2 text-center">{w.excluded}</td></tr>)}</tbody></table></div>
      <p className="text-xs text-slate-600">{overview.note} 质量排除是可审计的分析政策，不修改加密原始 FINAL；参与者撤回另行处理。</p>
      <section className="border rounded-xl p-4 space-y-3" aria-label="科研样本质量复核">
        <h3 className="font-semibold">科研样本质量复核</h3>
        <p className="text-xs text-slate-600">只列出本人项目已完成且未撤回的 FINAL。审核决定可恢复，必须注明理由并留痕。</p>
        <label className="block text-sm">本次复核理由（必填）
          <textarea className="input block w-full" maxLength={1000} value={qualityReason}
            onChange={e=>setQualityReason(e.target.value)} placeholder="例如：注意力题未通过；或重新检查后符合纳入标准"/>
        </label>
        {qualityRows.map(row=><div className="flex flex-wrap justify-between gap-3 border-b py-2" key={row.attemptId}>
          <div className="text-xs"><code>{row.attemptCode}</code>
            <p>{row.researchCode??'独立匿名作答'} · {row.verdict==='EXCLUDED'?'当前排除':'当前纳入'}</p>
            <p>{row.reason??'尚无人工质量复核'} · {new Date(row.completedAt).toLocaleString('zh-CN')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy}
              onClick={()=>qualityHistory?.attemptId===row.attemptId
                ?setQualityHistory(null):openQualityHistory(row)}>
              {qualityHistory?.attemptId===row.attemptId?'收起审核历史':'查看审核历史'}</button>
            <button type="button" className="btn-secondary"
              disabled={busy||qualityReason.trim().length<2}
              onClick={()=>markQuality(row,row.verdict==='EXCLUDED'?'INCLUDED':'EXCLUDED')}>
              {row.verdict==='EXCLUDED'?'恢复纳入':'排除有效样本'}</button>
          </div>
          {qualityHistory?.attemptId===row.attemptId&&<div className="w-full text-xs bg-slate-50 p-3 space-y-2">
            <strong>按时间倒序的质量审核记录（不展示原始回答）</strong>
            {qualityHistory.list.length===0&&<p>无更多审核记录。</p>}
            {qualityHistory.list.map(event=><p key={event.revision}>
              {new Date(event.reviewedAt).toLocaleString('zh-CN')} ·
              第 {event.revision} 次审核：
              {event.previousVerdict==='INCLUDED'?'纳入':'排除'} →
              {event.verdict==='INCLUDED'?'纳入':'排除'}；
              理由：{event.reason}
            </p>)}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="button"
                disabled={busy||qualityHistory.page<=1}
                onClick={()=>openQualityHistory(row,qualityHistory.page-1)}>上一页</button>
              <span>第 {qualityHistory.page} 页</span>
              <button className="btn-secondary" type="button"
                disabled={busy||qualityHistory.list.length<25}
                onClick={()=>openQualityHistory(row,qualityHistory.page+1)}>下一页</button>
            </div>
          </div>}
        </div>)}
        <div className="flex gap-3 items-center text-sm">
          <button className="btn-secondary" disabled={busy||qualityPage<=1}
            onClick={()=>void execute(()=>loadQuality(qualityPage-1))}>上一页</button>
          第 {qualityPage} 页
          <button className="btn-secondary" disabled={busy||qualityRows.length<25}
            onClick={()=>void execute(()=>loadQuality(qualityPage+1))}>下一页</button>
        </div>
      </section>
      {overview.collectionMode==='LINKED_WAVES'&&overview.waves.length>=2&&<div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">纵向匹配 · 有效完成记录</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">基线<select className="input block" value={baseline}
            onChange={e=>setBaseline(e.target.value)}>{overview.waves.map(w=>
              <option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}</select></label>
          <label className="text-sm">后测<select className="input block" value={followup}
            onChange={e=>setFollowup(e.target.value)}>{overview.waves.map(w=>
              <option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}</select></label>
          <button type="button" className="btn-secondary" disabled={busy||baseline===followup} onClick={compare}>计算匹配答卷数</button>
        </div>
        {paired&&<div className="text-sm grid sm:grid-cols-3 gap-3">
          <p>基线完成 <strong>{paired.baselineN}</strong></p><p>后测完成 <strong>{paired.followupN}</strong></p>
          <p>真正匹配 <strong>{paired.matchedN}</strong></p><p>失访 <strong>{paired.attritionN}</strong></p>
          <p>中途加入 <strong>{paired.lateJoinN}</strong></p>
          <p className="sm:col-span-3 text-xs">{paired.note} 量表配对得分只能在确定可比的工具版本下进一步计算。</p>
        </div>}
      </div>}
      <div className="border rounded-xl p-4 space-y-4">
        <h3 className="font-semibold">逐题与描述性统计</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">波次
            <select className="input block" value={waveId} onChange={e=>{setWaveId(e.target.value);setTicket(null);setItemStats(null);setGroupResult(null);setGroupItem('');setGroupScore('');setBoundedVariables([]);setBoundedItem(null)}}>
              {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
            </select></label>
          <button type="button" className="btn-secondary" disabled={busy||!waveId} onClick={loadItems}>
            查看此波次题目频数与探索性得分</button>
        </div>
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-medium text-sm">大样本单题统计（至多 6000 份有效 FINAL）</h4>
          <p className="text-xs text-slate-600">先读取冻结变量字典，再选择一个非敏感题目。
            后台按 200 份分页，仅累积受控频数、缺失和数值统计；全部页校验通过后才返回结果。
            本入口不自动展示敏感自由文本。</p>
          <button type="button" className="btn-secondary" disabled={busy||!waveId}
            onClick={openBoundedDictionary}>读取当前波次变量字典</button>
          {boundedVariables.length>0&&<div className="flex flex-wrap gap-2 items-end">
            <label className="block text-sm flex-1 min-w-[180px]">选择冻结变量
              <select className="input block w-full" aria-label="大样本题目" value={boundedItemKey}
                onChange={e=>{setBoundedItemKey(e.target.value);setBoundedItem(null)}}>
                {boundedVariables.map(q=><option key={q.columnKey} value={q.columnKey}>
                  {q.instrumentKey} · {q.prompt}（{q.itemKey}）</option>)}
              </select>
            </label>
            <button type="button" className="btn-secondary" disabled={busy||!boundedItemKey}
              onClick={loadBoundedItem}>计算本题完整分批统计</button>
          </div>}
          {boundedItem&&<div className="border rounded-lg p-3 text-sm space-y-2">
            <p className="font-medium">{boundedItem.prompt}</p>
            <p>有效分析 FINAL N={boundedItem.analysisFinalCount}，本题有效回答 N={boundedItem.respondentN}，
              均值={boundedItem.numericMean?.toFixed(2)??'—'}，
              SD={boundedItem.numericSampleSd?.toFixed(2)??'—'}</p>
            {boundedItem.frequencies.length>0&&<p>选项频数：
              {boundedItem.frequencies.map(row=>row.value+'：'+row.count).join('；')}</p>}
            {Object.keys(boundedItem.missingByReason).length>0&&<p>缺失：
              {Object.entries(boundedItem.missingByReason).map(([why,count])=>why+'：'+count).join('；')}</p>}
            <p className="text-xs text-slate-500">已核对全部有效 FINAL ·
              数据截止 {new Date(boundedItem.sourceCutOff).toLocaleString('zh-CN')} · {boundedItem.note}</p>
          </div>}
        </div>
        {itemStats&&<div className="space-y-4">
          <p className="text-xs">{itemStats.note}</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr><th className="text-left p-2">题目</th><th>有效回答 N</th><th>频数 / 缺失</th><th>数值均值</th></tr></thead>
            <tbody>{itemStats.items.slice(0,150).map(q=><tr key={q.itemKey+'-'+q.instrumentKey} className="border-t">
              <th className="text-left p-2 font-normal">{q.prompt}</th>
              <td className="text-center">{q.respondentN}</td>
              <td className="text-xs p-2">{q.frequencies.map(c=>c.value+': '+c.count).join('；')}
                {(q.combinationFrequencies?.length??0)>0&&<p>多选组合：
                  {q.combinationFrequencies!.map(x=>x.value+': '+x.count).join('；')}</p>}
                {Object.entries(q.missingByReason).length>0&&<p>缺失：{Object.entries(q.missingByReason).map(([k,v])=>k+': '+v).join('；')}</p>}</td>
              <td className="text-center">{q.numericMean===null?'—':q.numericMean.toFixed(2)}</td>
            </tr>)}</tbody>
          </table></div>
          {itemStats.descriptiveScores.length>0&&<div>
            <h4 className="font-semibold text-sm">研究性维度得分（非诊断）</h4>
            {itemStats.descriptiveScores.map(m=><p key={m.instrumentKey+':'+m.scoreKey} className="text-sm my-1">
              {m.instrumentKey} · {m.scoreKey}：N={m.validN}，
              M={m.mean?.toFixed(2)??'—'}，
              SD={m.sampleSd?.toFixed(2)??'—'}
            </p>)}
          </div>}
        </div>}
        {itemStats&&itemStats.items.some(q=>q.kind==='FORM'&&['SINGLE','LIKERT'].includes(q.responseType||''))
          &&itemStats.descriptiveScores.length>0&&
          <div className="border-t pt-3 space-y-3">
            <h4 className="font-medium">Form 分组变量 · 描述性量表得分比较</h4>
            <p className="text-xs">仅使用本项目冻结的单选/量表回答，不展示少于 5 份完成回答的分组。</p>
            <select className="input block w-full" aria-label="选择 Form 分组题"
              value={groupItem} onChange={e=>{setGroupItem(e.target.value);setGroupResult(null)}}>
              <option value="">选择 Form 分组题</option>
              {itemStats.items.filter(q=>q.kind==='FORM'&&['SINGLE','LIKERT'].includes(q.responseType||''))
                .map(q=><option key={q.instrumentKey+':'+q.itemKey}
                  value={q.instrumentKey+':'+q.itemKey}>{q.prompt}</option>)}
            </select>
            <select className="input block w-full" aria-label="选择组内描述性计分"
              value={groupScore} onChange={e=>{setGroupScore(e.target.value);setGroupResult(null)}}>
              <option value="">选择需要比较的研究性得分</option>
              {itemStats.descriptiveScores.map(q=><option key={q.instrumentKey+':'+q.scoreKey}
                value={q.instrumentKey+':'+q.scoreKey}>{q.instrumentKey} / {q.scoreKey}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={busy||!groupItem||!groupScore}
              onClick={compareGroups}>计算受控分组描述</button>
            {groupResult&&<div className="text-sm space-y-2">
              {groupResult.groups.map(g=><p key={g.optionCode}>{g.optionLabel}：
                N={g.respondentN}，得分有效 N={g.scoreValidN}，
                M={g.mean?.toFixed(2)??'—'}，SD={g.sampleSd?.toFixed(2)??'—'}</p>)}
              <p>未展示的小样本组：{groupResult.suppressedGroups}；最低单组样本数：{groupResult.minGroupN}</p>
              <p className="text-xs">{groupResult.note}</p>
            </div>}
          </div>}
        {itemStats&&overview.collectionMode==='LINKED_WAVES'&&itemStats.descriptiveScores.length>0&&
        <div className="border-t pt-3 space-y-3">
          <h4 className="font-medium">可比较指标的配对平均变化</h4>
          <select aria-label="选择配对比较指标" className="input block w-full"
            value={metricInstrument+':'+metricKey}
            onChange={e=>{const [instrument,score]=e.target.value.split(':')
              setMetricInstrument(instrument);setMetricKey(score);setPairedScore(null)}}>
            {itemStats.descriptiveScores.map(metric=>
              <option key={metric.instrumentKey+':'+metric.scoreKey}
                value={metric.instrumentKey+':'+metric.scoreKey}>
                {metric.instrumentKey} / {metric.scoreKey}</option>)}
          </select>
          <button type="button" className="btn-secondary" disabled={busy||!baseline||!followup||
            baseline===followup} onClick={compareScore}>计算真实配对样本的分数变化</button>
          {pairedScore&&<p className="text-sm">
            匹配 N={pairedScore.matchedN}，{pairedScore.comparability==='COMPARABLE'
              ?'配对均值变化 '+(pairedScore.meanPairedChange?.toFixed(2)??'样本不足')
              :'不可直接比较：'+(pairedScore.reason||'测量或计分版本不一致')}。
            这只是描述性比较，不构成干预因果或诊断结论。
          </p>}
        </div>}
      </div>
      <div className="border rounded-xl p-4 space-y-4">
        <h3 className="font-semibold">匿名科研数据导出</h3>
        <p className="text-sm">导出可能包含自由文本或研究编号，请确认研究用途与数据保存规定。每批导出最多处理 250 份 FINAL、2MB；RAW_WAVE 以及选定单波次的 RAW_LONG / SCORE_LONG 可按签名游标连续分批。全部波次 Wide 与未限定波次的 Long 仍适用 250 FINAL 上限；分批时请保留全部 CSV、Codebook、Manifest。</p>
        <form className="flex flex-wrap gap-3 items-end" onSubmit={stepUp}>
          <label className="text-sm">最新 TOTP 动态验证码
            <input className="input block" inputMode="numeric" type="password" autoComplete="off"
              value={otp} onChange={e=>setOtp(e.target.value)} placeholder="6 位验证码"/></label>
          <button className="btn-secondary" disabled={busy||otp.length<6}>完成五分钟内二次认证</button>
        </form>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">数据格式
            <select className="input block" value={format} onChange={e=>{setFormat(e.target.value as ExportFormat);setTicket(null)}}>
              {Object.entries(kindOptions).filter(([kind])=>
                overview.collectionMode==='LINKED_WAVES'||!kind.includes('WIDE'))
                .map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}
            </select></label>
          {['RAW_LONG','SCORE_LONG'].includes(format)&&
             <label className="text-sm">大样本可选单波次分批导出
               <select className="input block" value={exportWaveId}
                 onChange={e=>{setExportWaveId(e.target.value);setTicket(null)}}>
                 <option value="">全部波次（≤250 FINAL）</option>
                 {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
               </select>
             </label>}
           {format==='RAW_WAVE'&&<label className="text-sm">波次
            <select className="input block" value={waveId} onChange={e=>{setWaveId(e.target.value);setTicket(null)}}>
              {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
            </select></label>}
          {format==='RAW_WAVE'&&<div className="grid gap-2 text-sm">
            <label>完成时间起点（含）<input type="datetime-local" className="input block w-full"
              value={completedFrom} onChange={e=>{setCompletedFrom(e.target.value);setTicket(null)}}/></label>
            <label>完成时间终点（不含）<input type="datetime-local" className="input block w-full"
              value={completedBefore} onChange={e=>{setCompletedBefore(e.target.value);setTicket(null)}}/></label>
            <p className="text-xs">留空表示不限制。按完成时间分段；未 FINAL 的记录可能重复出现，合并时请按研究编号和状态去重。</p>
          </div>}
          <button type="button" className="btn-primary" disabled={busy||format==='RAW_WAVE'&&!waveId}
            onClick={()=>createExport()}>创建受控导出</button>
        </div>
        {format.startsWith('RAW')&&<label className="flex gap-2 text-sm items-start rounded-lg border border-amber-200 bg-amber-50 p-3">
          <input type="checkbox" checked={includeFreeText}
            onChange={e=>{setIncludeFreeText(e.target.checked);setTicket(null)}}/>
          包含自由文本原始回答（可能含姓名、班级或间接身份线索）。默认不导出，需要确认本项目知情同意覆盖该用途，并妥善控制保存与共享。
        </label>}
        {ticket&&<div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm">导出 {ticket.format} · 第 {ticket.pageNumber||1} 批 · {ticket.manifest.rowCount} 行 ·
            {ticket.manifest.columnCount} 列</p>
          <p className="text-xs">到期：{new Date(ticket.expiresAt).toLocaleString('zh-CN')}</p>
          <button type="button" className="btn-secondary" disabled={busy} onClick={download}>
            下载当前批次 CSV、Codebook 与 Manifest</button>
          {ticket.nextCursor&&<button className="btn-secondary" type="button"
            disabled={busy||!batchDownloaded} onClick={()=>createExport(ticket.nextCursor!)}>
            当前批次已下载，生成下一批</button>}
          {ticket.nextCursor&&<p className="text-xs">分批数据以同一时间水位和研究修订版本固定样本范围；
            逐批合并同名字段，不将不同批次作为独立研究波次。</p>}
        </div>}
      </div>
    </>}
  </section>
}

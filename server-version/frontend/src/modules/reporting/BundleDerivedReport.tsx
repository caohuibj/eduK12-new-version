import type {DerivedBundleView} from '../../../../backend/src/modules/assessment-bundle/onboarding/derived-report'
import {ReportRangeTrack,ReportSection} from './ReportPrimitives'

export type {DerivedBundleView}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=128&&v.every(x=>typeof x==='string')
/** Transport shape only. Numbers, themes and maxima are never derived here. */
export function isDerivedBundleView(value:unknown):value is DerivedBundleView{
 if(!record(value)||value.schemaVersion!=='bundle-derived-view-v1')return false
 const {rows,maxSets,theme,conclusions,blocks}=value
 return Array.isArray(rows)&&rows.length<=128&&rows.every(r=>record(r)&&typeof r.rowKey==='string'&&typeof r.label==='string'
  &&['sum','mean','count','ratio','position','score'].includes(r.unit)&&finite(r.order)&&strings(r.evidenceKeys)
  &&['present','missing','invalid','not_applicable','redacted'].includes(r.state)
  &&(r.state==='present'?finite(r.value):r.value===null)&&(r.denominator===null||finite(r.denominator))
  &&(r.itemCount===null||finite(r.itemCount))&&(r.timeframe===null||typeof r.timeframe==='string')
  &&(r.range===null||record(r.range)&&finite(r.range.min)&&finite(r.range.max)&&r.range.min<r.range.max)
  &&(r.quality===undefined||['interpretable','limited','invalid','unavailable'].includes(r.quality)))
  &&Array.isArray(maxSets)&&maxSets.length<=32&&maxSets.every(s=>record(s)&&typeof s.key==='string'
   &&['present','missing','invalid','not_applicable','redacted'].includes(s.state)
   &&(s.state==='present'?finite(s.maximum)&&strings(s.maxKeys)&&strings(s.orderedKeys):s.maximum===null&&s.maxKeys===null&&s.orderedKeys===null))
  &&(theme===null||record(theme)&&['MATCHED','MIXED','BOUNDARY','UNCLASSIFIED','INSUFFICIENT','INVALID','NOT_APPLICABLE','WITHHELD'].includes(theme.state)
   &&(theme.profileId===null||typeof theme.profileId==='string')&&strings(theme.axisKeys)&&theme.margin===null)
  &&Array.isArray(conclusions)&&conclusions.length<=64&&conclusions.every(c=>record(c)&&typeof c.ruleId==='string'&&typeof c.text==='string'
   &&typeof c.ruleVersion==='string'&&typeof c.kind==='string'&&strings(c.evidenceKeys)&&strings(c.supportRefs))
  &&Array.isArray(blocks)&&blocks.length<=128&&blocks.every(b=>record(b)&&typeof b.blockId==='string'&&typeof b.title==='string'
   &&['evidence','conclusions','limitations'].includes(b.kind)&&strings(b.rowKeys)&&strings(b.maxSetKeys)&&strings(b.ruleIds))
}
const number=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(value)
const units={sum:'合计分',mean:'题均分',count:'计数',ratio:'比例',position:'量尺位置',score:'原分'}
const states={missing:'暂无结果',invalid:'结果无效',not_applicable:'本次不适用',redacted:'当前未开放'}
const themes:Record<string,string>={MIXED:'本次有多条组合提示，保留多种解释。',BOUNDARY:'本次未形成单一组合提示，请结合各项结果阅读。',UNCLASSIFIED:'本次未形成单一组合提示。',INSUFFICIENT:'组合所需结果不完整，获准的独立结果仍可查看。',INVALID:'部分组合输入无效，获准的独立结果仍可查看。',NOT_APPLICABLE:'本次组合解释不适用。',WITHHELD:'当前未开放组合解释，获准的独立结果仍可查看。'}

/** The same authorized frozen view is used by all report readers. */
export function BundleDerivedReport({view}:{view:DerivedBundleView}){
 if(!isDerivedBundleView(view))return <p role="alert">报告结构不受支持，请重新读取。</p>
 return <div className="space-y-5" aria-label="本次组合结果">
  {view.theme&&themes[view.theme.state]&&<p role="status">{themes[view.theme.state]}</p>}
  {view.blocks.map(block=>{
   const rows=view.rows.filter(r=>block.rowKeys.includes(r.rowKey))
   const conclusions=view.conclusions.filter(c=>block.ruleIds.includes(c.ruleId))
   const maxima=view.maxSets.filter(s=>block.maxSetKeys.includes(s.key))
   return <ReportSection key={block.blockId} title={block.title}>
    {rows.length>0&&<div className="grid gap-4 md:grid-cols-2">{rows.map(row=>{
     const value=row.state==='present'?row.value:null
     const status=row.state==='present'?(row.quality==='limited'?'仅供有限参考':units[row.unit]):states[row.state]
     return <div key={row.rowKey}>
      <ReportRangeTrack label={row.label} value={value} range={row.range}
       formattedValue={value===null?status:number(value)} status={status}/>
      <p className="text-sm text-gray-600 dark:text-gray-300">{units[row.unit]}{row.itemCount!==null?` · 题数：${row.itemCount}`:''}{row.denominator!==null?` · 有效分母：${number(row.denominator)}`:''}</p>
      {row.timeframe&&<p className="text-sm text-gray-600 dark:text-gray-300">时间范围：{row.timeframe}</p>}
     </div>
    })}</div>}
    {maxima.map(set=>{
     const labels=set.maxKeys?.map(key=>view.rows.find(r=>r.unit!=='position'&&r.evidenceKeys.length===1&&r.evidenceKeys[0]===key)?.label)
     return <p key={set.key} className="mt-3">{set.state==='present'&&labels?.length&&labels.every(Boolean)
      ?`本次最高方向：${labels.join('、')}。同样高的方向全部保留；小分差不表示显著差异。`
      :set.state==='present'?'最高方向名称暂不可展示。':`最高方向：${states[set.state]}`}</p>
    })}
    {conclusions.length>0&&<ul className="mt-3 list-disc space-y-2 pl-5">{conclusions.map(c=><li key={c.ruleId}>{c.text}</li>)}</ul>}
   </ReportSection>
  })}
 </div>
}

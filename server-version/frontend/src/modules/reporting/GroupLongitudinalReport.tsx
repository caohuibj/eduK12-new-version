import './group-longitudinal-ui.css'
import {ReportTrendChart} from './ReportTrendChart'
import type {LongitudinalTrendModel} from './longitudinalVisualization'

export type GroupLongitudinalArtifact={artifactId:string;generatedAt:string;projection:{
 planId:string;sourceKey:string;title:string;wavePopulationLabels?:Record<string,string>;limitations:string[];metrics:Array<{id:string;label:string;unit:string;points:Array<{
  waveId:string;ordinal:number;label:string;observedFrom:string|null;observedUntil:string|null
  completedN:number|null;countUnit:'PERSON'|'RESPONSE';validN:number|null;missingN:number|null
  state:'present'|'missing'|'suppressed';mean:number|null;sdSample:number|null
  adjacentDelta:number|null;baselineDelta:number|null;intermediateMissing:boolean;populationChanged:boolean|null
 }> }>
}}
const number=(n:number|null)=>n===null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(n)
const delta=(n:number|null)=>n===null?'—':(n>0?'+':'')+number(n)
export function GroupLongitudinalReport({artifact}:{artifact:GroupLongitudinalArtifact}){
 return <article className="group-longitudinal-report space-y-5" aria-label="群体纵向报告">
  <header><h3>{artifact.projection.title}</h3><p>生成时间：{new Date(artifact.generatedAt).toLocaleString('zh-CN')}</p>
   <p>各轮分别统计当时人群。均值之差不是同一人的平均改变。</p></header>
  {artifact.projection.metrics.map(metric=>{
   const model:LongitudinalTrendModel={metricId:metric.id,state:metric.points.some(p=>p.mean!==null)?'comparable':'unavailable',
    hasSuppressedValues:metric.points.some(p=>p.state==='suppressed'),points:metric.points.map(p=>({label:'T'+p.ordinal,value:p.mean})),
    segments:metric.points.slice(1).map((p,i)=>({fromIndex:i,toIndex:i+1,connect:p.adjacentDelta!==null,comparabilityLevel:p.adjacentDelta!==null?'EXACT':'UNAVAILABLE'}))}
   return <section key={metric.id} className="space-y-3 rounded-xl border p-3">
    <ReportTrendChart model={model} title={metric.label} valueLabel="人群均值" description={'原始分数单位：'+metric.unit}/>
    <div className="group-longitudinal-report__scroll"><table className="w-full text-sm"><thead><tr>
     <th>波次/测量时间</th><th>完成样本</th><th>有效/缺失</th><th>均值</th><th>样本标准差</th><th>与前轮均值差</th><th>与基线均值差</th>
    </tr></thead><tbody>{metric.points.map(point=><tr key={point.waveId}>
     <td>T{point.ordinal} · {point.label}{artifact.projection.wavePopulationLabels?.[point.waveId]&&<p>人群：{artifact.projection.wavePopulationLabels[point.waveId]}</p>}<br/>{point.observedFrom?new Date(point.observedFrom).toLocaleString('zh-CN'):'暂无测量时间'}
      {point.observedUntil&&point.observedUntil!==point.observedFrom&&<> 至 {new Date(point.observedUntil).toLocaleString('zh-CN')}</>}
      {point.populationChanged===true&&<p>完成样本人群组成有变化</p>}</td>
     <td>{number(point.completedN)}{point.completedN!==null&&(point.countUnit==='PERSON'?'人':'份答卷')}</td>
     <td>{number(point.validN)} / {number(point.missingN)}</td>
     <td>{number(point.mean)}{point.state==='suppressed'?'（隐私保护）':point.state==='missing'?'（缺失）':''}</td>
     <td>{number(point.sdSample)}</td><td>{delta(point.adjacentDelta)}</td><td>{delta(point.baselineDelta)}{point.intermediateMissing&&'（中间波次有缺失）'}</td>
    </tr>)}</tbody></table></div>
   </section>
  })}
  <ul>{artifact.projection.limitations.map(note=><li key={note}>{note}</li>)}</ul>
 </article>
}

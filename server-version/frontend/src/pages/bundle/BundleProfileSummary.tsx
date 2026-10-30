import React from 'react'
import { ReportCoreSummary, ReportDetails, ReportSection } from '../../modules/reporting/ReportPrimitives'

export interface BundleProfileView {
  schemaVersion:'bundle-profile-view-v1'
  state:string;title:string;explanation:string|null;profileId:string|null;alternatives:string[]
  constructs:Array<{key:string;label:string;raw:number;min:number;max:number;referenceCenter:number|null}>
  candidates:Array<{profileId:string;name:string;matchingScore:number}>
  actions:string[];limitation:string
  methods:{key:string;version:string;hash:string;mappingVersion:string;templateVersion:string;algorithm:string;maturity:string}|null
}
const display=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value)
export default function BundleProfileSummary({view}:{view:BundleProfileView}){
  return <div className="space-y-5" aria-label="综合理论画像">
    <ReportCoreSummary label="理论试验 · 本次组合结果">
      <div><h3 className="text-lg font-semibold">{view.title}</h3>
        {view.explanation && <p className="mt-2 text-sm font-normal leading-7">{view.explanation}</p>}
        {view.alternatives?.length>0 && <p className="mt-2 text-sm font-normal">较接近的两种解释：{view.alternatives.join('；')}。本次不选定单一画像。</p>}
      </div>
    </ReportCoreSummary>
    <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{view.limitation}</p>
    {view.constructs.length>0 && <ReportSection title="原量尺结果" eyebrow="不同量尺分别阅读">
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">圆点表示本次结果；出现菱形时，表示预设理论参照，并非常模。量尺长度不能用于比较不同构念的强弱；各指标的方向请分别阅读。</p>
      <div className="grid gap-4 md:grid-cols-3">
        {view.constructs.map(c=>{
          const x=(value:number)=>24+(value-c.min)/(c.max-c.min)*252
          return <figure key={c.key} className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <figcaption className="text-sm font-medium">{c.label}：{display(c.raw)}</figcaption>
            <svg viewBox="0 0 300 70" className="mt-2 w-full" role="img" aria-label={c.label+'，本次'+display(c.raw)+'，量尺'+c.min+'至'+c.max+(c.referenceCenter===null?'':'，理论参照'+display(c.referenceCenter))}>
              <line x1="24" y1="30" x2="276" y2="30" stroke="currentColor" opacity=".35" strokeWidth="2"/>
              <text x="24" y="61" textAnchor="middle" fill="currentColor" fontSize="13">{c.min}</text>
              <text x="276" y="61" textAnchor="middle" fill="currentColor" fontSize="13">{c.max}</text>
              {c.referenceCenter!==null && <path d={'M '+x(c.referenceCenter)+' 36 l 6 6 l -6 6 l -6 -6 Z'} fill="none" stroke="currentColor" strokeWidth="2"/>}
              <circle cx={x(c.raw)} cy="22" r="6" fill="currentColor"/>
            </svg>
          </figure>
        })}
      </div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">原量尺结果文字表</caption><thead><tr><th className="py-2">指标</th><th>本次</th><th>原量尺</th></tr></thead>
        <tbody>{view.constructs.map(c=><tr key={c.key}><th className="py-2 font-normal">{c.label}</th><td>{display(c.raw)}</td><td>{c.min}—{c.max}</td></tr>)}</tbody>
      </table></div>
    </ReportSection>}
    {view.actions.length>0 && <ReportSection title="可以尝试的下一步" eyebrow="教育支持设计建议">
      <ul className="list-disc space-y-2 pl-5 text-sm">{view.actions.map(a=><li key={a}>{a}</li>)}</ul>
      <p className="mt-3 text-sm">这些建议并非经本画像专门试验证明的个体处方。</p>
    </ReportSection>}
    {view.methods && <ReportDetails title="模型版本与方法">
      <p className="text-sm">{view.methods.key} · {view.methods.version} · 理论试验版</p>
      <p className="mt-2 text-sm">模型使用预设规则与加权平均绝对距离，不在线拟合潜在类别。各指标的含义、方向与时间范围以本次冻结版本说明和获准单项报告为准。</p>
      <dl className="mt-3 break-all text-xs"><dt>映射 / 模板版本</dt><dd>{view.methods.mappingVersion} / {view.methods.templateVersion}</dd><dt className="mt-2">冻结模型标识</dt><dd>{view.methods.hash}</dd></dl>
      {view.candidates.length>0 && <table className="mt-4 w-full text-left text-sm"><caption className="text-left">模型内匹配分，不是归类概率</caption><thead><tr><th>理论参照</th><th>匹配分 / 100</th></tr></thead><tbody>
        {view.candidates.map(c=><tr key={c.profileId}><td className="py-2">{c.name}</td><td>{display(c.matchingScore)}</td></tr>)}
      </tbody></table>}
    </ReportDetails>}
  </div>
}

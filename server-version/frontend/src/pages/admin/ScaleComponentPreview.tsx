import type {ComponentPreview} from '../../api/scaleComponentImport'

const object=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
const array=(value:unknown)=>Array.isArray(value)?value:[]
type NarrativeView={interpretations:Array<{scoreKey:string;headline:string;summary:string;guidance:Array<{text:string}>;bands:Array<{key:string;label:string;summary:string;guidance:Array<{text:string}>}>}>;limitations:string[];disclaimer:string}

/** Read-only projection of the existing exact preview. No band calculation,
 * source selection or compatibility decision is made by this component. */
export default function ScaleComponentPreview({preview}:{preview:ComponentPreview}){
 const definition=preview.triplet?.definition
 if(!definition)return null
 const parameters=object(preview.parts.PARAMETERS?.payload),report=preview.parts.REPORT?.payload
 const references=array(parameters?.references).map(object).filter(r=>r!==null)
 // The shared authoring type covers only descriptive score-only scales. Read
 // standard preview fields as a projection; never normalize them through it.
 const policy=object(definition.referencePolicy),narrative=definition.report as unknown as NarrativeView
 const selections=policy?.type==='declared'?array(policy.selections).map(object).filter(s=>s!==null):[]
 const bands:Array<{version:string;metric:string;key:string;label:string;lower:number|string;upper:number|string}>=[]
 for(const selection of selections){
  if(selection.referenceKind!=='criterion_threshold')continue
  for(const reference of references){
   if(reference.referenceVersion!==selection.referenceVersion)continue
   for(const value of array(reference.entries)){
    const entry=object(value)
    if(!entry||entry.scoreKey!==selection.scoreKey||entry.referenceKind!==selection.referenceKind||entry.governance)continue
    for(const value of array(object(entry.statistics)?.thresholds)){
     const band=object(value);if(!band)continue
     bands.push({version:String(selection.referenceVersion),metric:definition.scoring.scores.find(score=>score.key===selection.scoreKey)?.label??String(selection.scoreKey),key:String(band.key),label:String(band.label),
      lower:typeof band.minInclusive==='number'?band.minInclusive:'−∞',upper:typeof band.maxInclusive==='number'?band.maxInclusive:'∞'})
    }
   }
  }
 }
 const custom=object(report)?.template!==undefined
 return <section className="component-review" aria-label="参数与报告核对">
  <details open><summary>参数分档 · 所选参考版本</summary>{preview.parts.PARAMETERS?.payload===null?<p>本组合明确不配置参数。</p>:bands.length?<div className="component-table-scroll" tabIndex={0} role="region" aria-label="参数分档表，可横向滚动"><table><caption>仅展示所选版本中的普通准则分档；高级参考结构见完整定义。</caption><thead><tr><th>指标 / 参考版本</th><th>分档</th><th>下限（含）</th><th>上限（含）</th></tr></thead><tbody>{bands.map((b,i)=><tr key={i}><td>{b.metric}<small>{b.version}</small></td><td>{b.label}<small>{b.key}</small></td><td>{b.lower}</td><td>{b.upper}</td></tr>)}</tbody></table></div>:<p>此参数使用高级参考结构，请展开完整定义核对。</p>}</details>
  <details open><summary>报告文字 · 全部配置分档</summary>{report===null?<p>本组合明确不提供报告。</p>:custom?<p>此报告使用自定义结构；请展开完整定义核对区块、素材和图表。</p>:<><p className="component-help">实际显示仍取决于冻结的分数和参考结果。</p>{narrative.interpretations.map(i=><article key={i.scoreKey}><h4>{i.headline}</h4><p>{i.summary}</p>{i.guidance.map((g,n)=><p key={n}>{g.text}</p>)}{i.bands.map(b=><div key={b.key}><strong>{b.label} <small>{b.key}</small></strong><p>{b.summary}</p>{b.guidance.map((g,n)=><p key={n}>{g.text}</p>)}</div>)}</article>)}{narrative.limitations.map((text,i)=><p key={i}>{text}</p>)}<p>{narrative.disclaimer}</p></>}</details>
 </section>
}

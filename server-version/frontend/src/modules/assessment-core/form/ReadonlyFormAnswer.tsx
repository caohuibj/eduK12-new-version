export type ReadonlyFormValue = string | number | string[] | Record<string,string|number|string[]> | null
export type ReadonlyFormPresentation = {type:string;options:Array<{key:string;label:string}>;rows:Array<{key:string;label:string}>}
const states:Record<string,string>={ANSWERED:'已回答',REFUSED:'明确拒答',SHOWN_MISSING:'已显示未填写',NOT_SHOWN:'未显示'}
/** Shared read-only presentation. Receives accepted values; never derives scores,
 * visibility, or missing/refusal states from the value. */
export function ReadonlyFormAnswer({value,presentation,state,rowStates}:{value:ReadonlyFormValue;presentation:ReadonlyFormPresentation;state?:string;rowStates?:Record<string,string>}) {
  const label=(key:string)=>presentation.options.find(option=>option.key===key)?.label??key
  const show=(cell:unknown):string=>cell===null||cell===undefined?'—':Array.isArray(cell)?cell.map(String).map(label).join('、'):typeof cell==='string'?label(cell):String(cell)
  if(!['MATRIX','MATRIX_MULTIPLE'].includes(presentation.type) && (state==='NOT_SHOWN'||state==='REFUSED'||state==='SHOWN_MISSING')) return <div className="mt-1 text-sm">—</div>
  if(presentation.type==='RANK_ORDER' && Array.isArray(value)) return <ol className="mt-1 list-decimal pl-5 text-sm">{value.map((key,index)=><li key={`${index}:${key}`}>{label(key)}</li>)}</ol>
  if(presentation.type==='MATRIX'||presentation.type==='MATRIX_MULTIPLE') {
    const cells=value && typeof value==='object'&&!Array.isArray(value)?value:{}
    return <dl className="mt-1 space-y-1 text-sm">{presentation.rows.map(row=><div key={row.key}><dt>{row.label}{rowStates?.[row.key]?`（${states[rowStates[row.key]]??'作答状态待核对'}）`:''}</dt><dd>{state==='NOT_SHOWN'||(rowStates?.[row.key] && rowStates[row.key]!=='ANSWERED')?'—':show(cells[row.key])}</dd></div>)}</dl>
  }
  if(presentation.type==='CONSTANT_SUM') {
    const cells=value && typeof value==='object'&&!Array.isArray(value)?value:{}
    return <dl className="mt-1 space-y-1 text-sm">{presentation.options.map(option=><div key={option.key}><dt>{option.label}</dt><dd>{show(cells[option.key])}</dd></div>)}</dl>
  }
  return <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{show(value)}</div>
}

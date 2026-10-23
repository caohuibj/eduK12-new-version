/** Authoring estimate only. This never supplies a participant's score or norms. */
export type ScoreSummaryItem = {key:string; scores:readonly number[]}
export function scoreSelectionSummary({items,selected,aggregation,precision=1}:{
  items:readonly ScoreSummaryItem[];selected:readonly {key:string;weight?:number}[];
  aggregation:'sum'|'mean';precision?:number
}):string{
  const ranges=selected.map(entry=>{
    const scores=items.find(item=>item.key===entry.key)?.scores
    const weight=aggregation==='mean'?1:entry.weight??1
    if(!scores?.length||scores.some(score=>!Number.isFinite(score))||!Number.isFinite(weight)||weight<=0)return null
    return {min:Math.min(...scores)*weight,max:Math.max(...scores)*weight}
  })
  const complete=ranges.length>0&&ranges.every(range=>range!==null)
  const divisor=aggregation==='mean'?selected.length:1
  const digits=Math.max(0,Math.min(6,precision))
  const range=complete?`${(ranges.reduce((n,r)=>n+r!.min,0)/divisor).toFixed(digits)}–${(ranges.reduce((n,r)=>n+r!.max,0)/divisor).toFixed(digits)}`:'请先选题并完成选项计分'
  const omitted=items.filter(item=>!selected.some(entry=>entry.key===item.key)).map(item=>item.key)
  return `已纳入 ${selected.length}/${items.length} 题 · 预计范围 ${range}。${omitted.length?`未纳入：${omitted.join('、')}。请核对报告文案，避免将部分计分称为全部题目合计。`:'全部题目已纳入。'}`
}

import type {PackageGrant} from '../api/surveyGovernance'
import type {FlowDraft,FlowBlock} from './flow.client'
export type PackageMembership=PackageGrant&{bindings:{draftId:string;slotKey:string;instrumentKey:string}[]}
export type ArrangementUnit={id:string;ids:string[];package?:PackageMembership;issues:string[]}
export function packageArrangement(ids:readonly string[],packages:readonly PackageMembership[]):ArrangementUnit[]{
 const byDraft=new Map(packages.flatMap(p=>p.bindings.map(b=>[b.draftId,p] as const))),seen=new Set<string>(),result:ArrangementUnit[]=[]
 for(const id of ids){
  const p=byDraft.get(id)
  if(!p){result.push({id,ids:[id],issues:[]});continue}
  if(seen.has(p.id))continue;seen.add(p.id)
  const approved=p.bindings.map(b=>b.draftId),positions=approved.map(member=>ids.indexOf(member)),actual=ids.filter(member=>approved.includes(member))
  const issues=[]
  if(positions.some(n=>n<0))issues.push('整包不完整')
  if(actual.some((member,i)=>member!==approved.filter(x=>ids.includes(x))[i]))issues.push('整包成员顺序不符合批准版本')
  const selectedPositions=positions.filter(n=>n>=0).sort((a,b)=>a-b)
  if(selectedPositions.some((n,i)=>i>0&&n!==selectedPositions[i-1]+1))issues.push('其他工具插入整包内部')
  result.push({id:p.id,ids:[...actual],package:p,issues})
 }
 return result
}
export function restorePackage(ids:readonly string[],p:PackageMembership){
 const own=new Set(p.bindings.map(b=>b.draftId)),anchor=ids.findIndex(id=>own.has(id)),next=ids.filter(id=>!own.has(id))
 const before=ids.slice(0,Math.max(0,anchor)).filter(id=>!own.has(id)).length
 next.splice(before,0,...p.bindings.map(b=>b.draftId));return next
}
export function moveArrangementUnit(ids:readonly string[],packages:readonly PackageMembership[],id:string,direction:-1|1){
 const units=packageArrangement(ids,packages),at=units.findIndex(u=>u.id===id),to=at+direction
 if(at<0||to<0||to>=units.length||units.some(u=>u.issues.length))return [...ids]
 ;[units[at],units[to]]=[units[to],units[at]]
 return units.flatMap(u=>u.ids)
}
function interleavedKeys(keys:readonly string[],own:Set<string>){
 const positions=keys.flatMap((key,i)=>own.has(key)?[i]:[])
 return positions.length?keys.slice(positions[0],positions[positions.length-1]+1).filter(key=>!own.has(key)):[]
}
function isSubsequence(next:readonly string[],previous:readonly string[]){
 let at=0
 return next.every(key=>{const found=previous.indexOf(key,at);at=found+1;return found>=0})
}
function constrainedPrefix(flow:FlowDraft,p:PackageMembership){
 const last=Math.max(...flow.blocks.map((b,i)=>b.kind==='INSTRUMENT'&&p.bindings.some(member=>member.instrumentKey===b.instrumentKey)?i:-1))
 return flow.blocks.slice(0,last+1).filter(b=>b.when||b.kind==='END')
}
export function packageFlowProblems(flow:FlowDraft|null,packages:readonly PackageMembership[]){
 if(!flow)return []
 const execution=flow.blocks.filter(b=>b.kind==='INSTRUMENT'),issues:string[]=[]
 for(const p of packages){
  const approved=p.bindings.map(b=>b.instrumentKey),start=execution.findIndex(b=>b.instrumentKey===approved[0])
  if(start<0||approved.some((key,i)=>execution[start+i]?.instrumentKey!==key)||execution.filter(b=>approved.includes(b.instrumentKey!)).length!==approved.length)issues.push(p.id+':ORDER')
  const last=Math.max(...flow.blocks.map((b,i)=>b.kind==='INSTRUMENT'&&approved.includes(b.instrumentKey!)?i:-1))
  if(flow.blocks.slice(0,last+1).some(b=>b.when||b.kind==='END'))issues.push(p.id+':CONDITION_OR_END')
  if(flow.experiment)issues.push(p.id+':EXPERIMENT')
 }
 return issues
}
export function packageFlowChangeAllowed(previous:FlowDraft|null,next:FlowDraft|null,packages:readonly PackageMembership[]){
 const old=packageFlowProblems(previous,packages)
 const current=packageFlowProblems(next,packages)
 if(current.some(problem=>!old.includes(problem)))return false
 if(current.some(problem=>problem.endsWith(':ORDER'))&&JSON.stringify(previous?.blocks.filter(b=>b.kind==='INSTRUMENT'))!==JSON.stringify(next?.blocks.filter(b=>b.kind==='INSTRUMENT')))return false
 if(current.some(problem=>problem.endsWith(':EXPERIMENT'))&&JSON.stringify(previous?.experiment)!==JSON.stringify(next?.experiment))return false
 for(const p of packages){
  const constrained=(f:FlowDraft|null)=>{
   const last=Math.max(...(f?.blocks.map((b,i)=>b.kind==='INSTRUMENT'&&p.bindings.some(member=>member.instrumentKey===b.instrumentKey)?i:-1)??[-1]))
   return f?.blocks.slice(0,last+1).filter(b=>b.when||b.kind==='END')??[]
  }
  const before=constrained(previous)
  if(constrained(next).some(b=>!before.some(old=>JSON.stringify(old)===JSON.stringify(b))))return false
 }
 return true
}
/** Pure editor planning. It does not freeze/admit, grant rights or mutate a draft.
 * Materials/END stay at their existing barriers; crossing one needs an explicit
 * material decision, so the original draft is returned as a rejected plan. */
export function planPackageSelection(ids:string[],next:string[],packages:readonly PackageMembership[],tools:readonly {id:string;instrumentKey:string}[],flow:FlowDraft|null):{ids:string[];flow:FlowDraft|null;error?:string}{
 const reject=(error:string)=>({ids,flow,error})
 if(next.length>30)return reject('本波次超过 30 个工具上限；原草稿保留，请先明确移除其他编排单元。')
 const units=packageArrangement(next,packages),before=new Map(packageArrangement(ids,packages).map(unit=>[unit.id,unit]))
 // One explicit repair/removal must remain possible when another instance is
 // already damaged. Unresolved instances keep the exact selected members and
 // cannot gain a problem or an additional/reordered intervening tool.
 if(units.some(unit=>{
  if(!unit.issues.length)return false
  const old=before.get(unit.id),own=new Set(unit.package!.bindings.map(b=>b.draftId))
  return !old||unit.issues.some(issue=>!old.issues.includes(issue))||JSON.stringify(unit.ids)!==JSON.stringify(old.ids)
   ||!isSubsequence(interleavedKeys(next,own),interleavedKeys(ids,own))
 }))return reject('整包只能整体编排，不能新增或加重其他整包问题；请逐包显式恢复批准顺序或从本波次移除。')
 if(!flow)return {ids:next,flow:null}
 const byId=new Map(tools.map(t=>[t.id,t.instrumentKey]))
 for(const p of packages)for(const b of p.bindings)byId.set(b.draftId,b.instrumentKey)
 if(next.some(id=>!byId.has(id)))return reject('尚未读取选用工具的精确标识；草稿未改变，请重试读取。')
 const keyToBlock=new Map<string,FlowBlock>(),segment=new Map<string,number>(),barriers:FlowBlock[]=[]
 let position=0
 for(const b of flow.blocks){
  if(b.kind!=='INSTRUMENT'){barriers.push(b);position++;continue}
  if(keyToBlock.has(b.instrumentKey!))return reject('流程存在重复工具块；请先核对原流程，草稿未改变。')
  keyToBlock.set(b.instrumentKey!,b);segment.set(b.instrumentKey!,position)
 }
 const keys=next.map(id=>byId.get(id)!),selected=new Set(keys)
 const previous=new Set(ids.map(id=>byId.get(id)))
 if([...keyToBlock.keys()].some(key=>!previous.has(key)&&!selected.has(key)))return reject('原流程有未选用的其他工具块；请先核对，草稿未改变。')
 for(const p of packages){
  const own=p.bindings.map(b=>b.instrumentKey),old=own.filter(k=>segment.has(k)),groups=new Set(old.map(k=>segment.get(k)!))
  if(groups.size>1&&(!own.every(k=>selected.has(k))||keys.some((key,i)=>key!==flow.blocks.filter(b=>b.kind==='INSTRUMENT').map(b=>b.instrumentKey)[i])))return reject('整包组件之间含材料或结束块，移动含义不明确；请先在流程中明确材料位置，原草稿保留。')
  if(groups.size===1)for(const key of own)if(selected.has(key)&&!segment.has(key))segment.set(key,[...groups][0])
 }
 for(let i=0;i<keys.length;i++)if(!segment.has(keys[i])){
  const before=keys.slice(0,i).reverse().find(k=>segment.has(k)),after=keys.slice(i+1).find(k=>segment.has(k))
  const left=before===undefined?undefined:segment.get(before),right=after===undefined?undefined:segment.get(after)
  if(barriers.length&&left!==right&&left!==undefined&&right!==undefined)return reject('新工具位于材料两侧之间，位置有歧义；原草稿保留。')
  segment.set(keys[i],left??right??0)
 }
 if(keys.some((key,i)=>i>0&&segment.get(key)!<segment.get(keys[i-1])!))return reject('这次编排会跨越材料或结束块；请先明确材料位置，原草稿保留。')
 const blocks:FlowBlock[]=[]
 for(let n=0;n<=barriers.length;n++){
  for(const key of keys.filter(k=>segment.get(k)===n))blocks.push(keyToBlock.get(key)??{blockKey:'unit_'+next[keys.indexOf(key)].replace(/[^a-zA-Z0-9_]/g,'').slice(0,40),kind:'INSTRUMENT',instrumentKey:key})
  if(barriers[n])blocks.push(barriers[n])
 }
 const planned={...flow,blocks},active=packages.filter(p=>p.bindings.some(b=>next.includes(b.draftId)))
 const oldProblems=packageFlowProblems(flow,packages.filter(p=>p.bindings.some(b=>ids.includes(b.draftId)))),remaining=packageFlowProblems(planned,active)
 if(remaining.some(problem=>!oldProblems.includes(problem))||active.some(p=>{
  const own=new Set(p.bindings.map(b=>b.instrumentKey)),oldBlocks=flow.blocks.filter(b=>b.kind==='INSTRUMENT'&&own.has(b.instrumentKey!)),newBlocks=blocks.filter(b=>b.kind==='INSTRUMENT'&&own.has(b.instrumentKey!))
  return remaining.includes(p.id+':ORDER')&&(JSON.stringify(oldBlocks)!==JSON.stringify(newBlocks)
   ||!isSubsequence(interleavedKeys(keys,own),interleavedKeys(flow.blocks.filter(b=>b.kind==='INSTRUMENT').map(b=>b.instrumentKey!),own)))
   ||constrainedPrefix(planned,p).some(block=>!constrainedPrefix(flow,p).some(old=>JSON.stringify(old)===JSON.stringify(block)))
 }))return reject('这次编排会新增或加重整包流程问题；原草稿保留，请逐包显式修复。')
 return {ids:next,flow:planned}
}

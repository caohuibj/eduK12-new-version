import { useEffect, useRef, useState } from 'react'
import { reportingApi, type CohortMemberOption, type CohortSelector } from '../../api/reporting'

export function ReportingMemberPicker({ organizationId, value, onChange }: {
  organizationId: string; value: CohortSelector; onChange: (value: CohortSelector) => void
}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[error,setError]=useState('')
  const [rows,setRows]=useState<CohortMemberOption[]>([]),[selected,setSelected]=useState<CohortMemberOption[]>([])
  const [next,setNext]=useState<number|null>(null),[busy,setBusy]=useState(false)
  const request=useRef(0)
  const clause=value.clauses.find(c=>c.kind==='MEMBERSHIP_IDS')
  const ids=clause?.kind==='MEMBERSHIP_IDS'?clause.membershipIds:[]
  useEffect(()=>{if(!ids.length)setSelected([])},[ids.length])
  useEffect(()=>{const counter=request;counter.current++;setRows([]);setSelected([]);setOpen(false);return ()=>{counter.current++}},[organizationId])
  const find=async(page=1)=>{
    const current=++request.current
    setBusy(true);setError('');if(page===1)setRows([])
    try {
      const result=await reportingApi.cohortMembers(organizationId,search,page)
      if(current!==request.current)return
      setRows(old=>page===1?result.list:[...old,...result.list]);setNext(result.nextPage)
    } catch(e) {
      if(current!==request.current)return
      setRows([]);setSelected([]);setNext(null)
      setError(e instanceof Error?e.message:'无法读取成员，请确认访问权限')
    } finally {if(current===request.current)setBusy(false)}
  }
  const toggle=(member:CohortMemberOption,checked:boolean)=>{
    const updated=checked?[...selected.filter(s=>s.userId!==member.userId),member]:selected.filter(s=>s.userId!==member.userId)
    setSelected(updated)
    const membershipIds=[...new Set(updated.flatMap(s=>s.membershipIds))]
    onChange({...value,clauses:[...value.clauses.filter(c=>c.kind!=='MEMBERSHIP_IDS'),...(membershipIds.length?[{kind:'MEMBERSHIP_IDS' as const,membershipIds}]:[])]})
  }
  return <fieldset className="space-y-2"><legend>指定成员（可选）</legend>
    <p className="text-sm">仅显示当前有权查看的成员；选择后与上方班级、标签条件同时生效。</p>
    <button type="button" disabled={busy} onClick={()=>{setOpen(!open);if(!open)void find()}}>{open?'收起成员选择':'选择指定成员'}</button>
    {selected.length>0 && <ul aria-label="已选成员">{selected.map(s=><li key={s.userId}>{s.name} <button type="button" onClick={()=>toggle(s,false)}>移除 {s.name}</button></li>)}</ul>}
    {open && <div className="space-y-2">
      <label>搜索成员<input value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setNext(null)}} /></label>
      <button type="button" disabled={busy} onClick={()=>void find()}>搜索成员</button>
      <div className="flex flex-wrap gap-4">{rows.map(member=><label key={member.userId}><input type="checkbox" disabled={busy} checked={member.membershipIds.some(id=>ids.includes(id))} onChange={e=>toggle(member,e.target.checked)} />{member.name}</label>)}</div>
      {next && <button type="button" disabled={busy} onClick={()=>void find(next)}>更多成员</button>}
      {!busy&&!error&&!rows.length&&<p>没有可选成员</p>}
    </div>}
    {error&&<p role="alert">{error}</p>}
  </fieldset>
}

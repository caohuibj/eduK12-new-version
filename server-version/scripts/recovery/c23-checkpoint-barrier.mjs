/** Pure graph acceptance. No elapsed sleep can substitute for observed PG locks. */
export function pathsToGate(graph,gatePid,waiterPids){
 const allowed=new Set([gatePid,...waiterPids]),byPid=new Map(graph.map(row=>[row.pid,row]))
 if(allowed.size!==waiterPids.length+1||!byPid.has(gatePid)||waiterPids.length===0)return null
 const path=(pid,seen=[])=>{
  if(!allowed.has(pid)||seen.includes(pid))return null
  if(pid===gatePid)return [...seen,pid]
  const row=byPid.get(pid)
  if(!row||row.wait_event_type!=='Lock'||!row.blockers.length||row.blockers.some(p=>p===0||!allowed.has(p)))return null
  for(const blocker of row.blockers){const found=path(blocker,[...seen,pid]);if(found)return found}
  return null
 }
 const cyclic=(pid,seen=[])=>seen.includes(pid)||(byPid.get(pid)?.blockers??[]).filter(p=>allowed.has(p)).some(p=>cyclic(p,[...seen,pid]))
 if([...allowed].some(pid=>cyclic(pid)))return null
 const paths=waiterPids.map(pid=>path(pid));return paths.every(Boolean)?paths:null
}
export function descendants(graph,gatePid){
 const selected=new Set([gatePid]);let changed=true
 while(changed){changed=false;for(const row of graph)if(!selected.has(row.pid)&&row.blockers.some(pid=>selected.has(pid))){selected.add(row.pid);changed=true}}
 return [...selected].filter(pid=>pid!==gatePid).sort((a,b)=>a-b)
}

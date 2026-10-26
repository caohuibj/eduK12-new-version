import {EducationRosterWorkbench} from './EducationRosterWorkbench'
import type {RosterUnit} from './types'
import './education-roster.css'
import {useEffect,useRef,useState} from 'react'
import {Search,RefreshCw,X,ChevronLeft,ChevronRight} from 'lucide-react'
import type {EducationRosterApi as SchoolApi} from './types'
import {EducationPersonnelImport,type PersonnelPerson} from './EducationPersonnelImport'
import '../../school/school-personnel-directory.css'

type Entry={id:string;personId:string|null;kind:'STUDENT'|'STAFF';persona:string;source:string;
 number:string|null;name:string|null;username:string|null;reference:string|null;
 activation:string;account:string;membership:string;admission:string;existingAccount:boolean;
 classUnitId:string|null;className:string|null;grade:string|null}
type Detail=Entry&{classes:{className:string;grade:string;role:string;pending:boolean}[]}
type Page={list:Entry[];total:number;page:number;pageSize:number;batchImport?:boolean}
type Unit={id:string;unitKind:string;name:string;parentUnitId?:string|null}
type Props={api:SchoolApi;organizationId:string;units:Unit[];disabled?:boolean;onUnits?:(units:RosterUnit[])=>void;entry?:'SCHOOL'|'TEACHER'}
const activation:Record<string,string>={ACTIVATED:'已激活',PENDING:'待激活',OWNER_CONFIRMATION:'待本人确认'}
const membership:Record<string,string>={CURRENT:'当前成员',ENDED:'成员关系已结束',NONE:'尚未建立成员关系'}
const accounts:Record<string,string>={USABLE:'账号可用',UNAVAILABLE:'账号暂不可用',NOT_CREATED:'尚未激活账号'}
const admissions:Record<string,string>={APPROVED:'已通过班级审批',PENDING_CLASS_APPROVAL:'待班级审批',NOT_REGISTERED:'尚未注册',QUARANTINED:'已隔离',ENDED:'准入已结束',REVOKED:'准入已撤销'}
const title=(p:Entry)=>p.name||p.number||p.reference||p.username||'校园成员'
export function EducationPersonnelDirectory(props:Props){return <Directory key={props.organizationId} {...props}/>}
function Directory({api,organizationId,units,disabled,onUnits,entry='SCHOOL'}:Props){
 const [batchImport,setBatchImport]=useState(false)
 const [kind,setKind]=useState('ALL'),[state,setState]=useState('ALL'),[member,setMember]=useState('ALL')
 const [classId,setClassId]=useState(''),[sort,setSort]=useState('recent'),[query,setQuery]=useState(''),[draft,setDraft]=useState('')
 const [searchOpen,setSearchOpen]=useState(false),[page,setPage]=useState(1),[version,setVersion]=useState(0)
 const [data,setData]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [detail,setDetail]=useState<Detail|null>(null),[selected,setSelected]=useState(''),[detailBusy,setDetailBusy]=useState(false)
 const [importStarted,setImportStarted]=useState(false)
 const [importOpen,setImportOpen]=useState(false),[mfa,setMfa]=useState(false),[code,setCode]=useState(''),[verifying,setVerifying]=useState(false),[notice,setNotice]=useState('')
 const alive=useRef(true),listRequest=useRef(0),detailRequest=useRef(0)
 const base=`/organizations/${organizationId}/personnel/directory`
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const report=(cause:unknown)=>{
  const message=cause instanceof Error?cause.message:'人员信息暂不可用，请稍后重试。'
  setError(message);setData(null);setDetail(null);setSelected('')
  if(/敏感操作.*验证|重新验证.*动态|动态验证码.*重新验证/.test(message)){setMfa(true);setData(null);setDetail(null);setSelected('')}
 }
 useEffect(()=>{
  const request=++listRequest.current
  setData(null);setDetail(null);setSelected('');setDetailBusy(false);detailRequest.current++
  if(disabled){setBusy(false);return}
  setBusy(true);setError('');setNotice('')
  const params=new URLSearchParams({kind,activation:state,membership:member,sort,query,page:String(page),pageSize:'25'})
  if(classId)params.set('classUnitId',classId)
  void api<Page>(base+'?'+params).then(result=>{if(alive.current&&request===listRequest.current){if(result.batchImport)setBatchImport(true);const last=Math.max(1,Math.ceil(result.total/result.pageSize));if(page>last)setPage(last);else setData(result)}})
   .catch(cause=>{if(alive.current&&request===listRequest.current)report(cause)})
   .finally(()=>{if(alive.current&&request===listRequest.current)setBusy(false)})
 },[api,base,disabled,kind,state,member,classId,sort,query,page,version])
 const choose=(id:string)=>{
  const request=++detailRequest.current
  if(selected===id){setSelected('');setDetail(null);setDetailBusy(false);return}
  setSelected(id);setDetail(null);setDetailBusy(true);setError('');setImportOpen(false)
  void api<Detail>(base+'/'+encodeURIComponent(id)).then(result=>{if(alive.current&&request===detailRequest.current)setDetail(result)})
   .catch(cause=>{if(alive.current&&request===detailRequest.current)report(cause)})
   .finally(()=>{if(alive.current&&request===detailRequest.current)setDetailBusy(false)})
 }
 const change=(set:(value:string)=>void,value:string)=>{set(value);setPage(1)}
 const reset=()=>{setKind('ALL');setState('ALL');setMember('ALL');setClassId('');setSort('recent');setDraft('');setQuery('');setPage(1)}
 const filtered=kind!=='ALL'||state!=='ALL'||member!=='ALL'||!!classId||!!query
 const verify=async()=>{
  if(verifying)return
  setVerifying(true);setError('')
  try{await api('/auth/mfa/step-up','POST',{code});if(alive.current){setMfa(false);setCode('');setNotice('验证成功，请点击刷新重新读取名单。')}}
  catch(cause){if(alive.current)report(cause)}finally{if(alive.current)setVerifying(false)}
 }
 return <section id="school-roster-directory" className="education-roster hs-panel hs-personnel-directory" data-entry={entry} aria-label="全校人员目录" aria-busy={busy}>
  <div className="hs-directory-heading"><h2>人员名单</h2><div className="hs-actions">
   <button type="button" disabled={disabled} aria-expanded={importOpen} onClick={()=>{setImportStarted(true);setImportOpen(v=>!v);setSelected('');setDetail(null);detailRequest.current++}}>批量导入</button>
   <button type="button" aria-label="检索全校人员" aria-expanded={searchOpen} aria-pressed={searchOpen||!!query} onClick={()=>setSearchOpen(v=>!v)}><Search size={18}/></button>
   <button type="button" aria-label="刷新全校人员" disabled={busy||disabled} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={18}/></button>
  </div></div>
  <div className="hs-directory-filters">
   <label><span>人员</span><select value={kind} onChange={e=>change(setKind,e.target.value)}><option value="ALL">全部人员</option><option value="STUDENT">学生</option><option value="STAFF">教职工</option></select></label>
   <label><span>激活</span><select value={state} onChange={e=>change(setState,e.target.value)}><option value="ALL">全部激活状态</option><option value="PENDING">待激活／确认</option><option value="ACTIVATED">已激活</option></select></label>
   <label><span>成员</span><select value={member} onChange={e=>change(setMember,e.target.value)}><option value="ALL">全部成员状态</option><option value="CURRENT">当前成员</option><option value="ENDED">关系已结束</option><option value="NONE">尚未建立关系</option></select></label>
   <label><span>班级</span><select value={classId} onChange={e=>change(setClassId,e.target.value)}><option value="">全部班级</option>{units.filter(x=>x.unitKind==='CLASS').map(x=><option key={x.id} value={x.id}>{[units.find(g=>g.id===x.parentUnitId)?.name,x.name].filter(Boolean).join(' / ')}</option>)}</select></label>
   <label><span>排序</span><select value={sort} onChange={e=>change(setSort,e.target.value)}><option value="recent">最近登记</option><option value="pending">待激活优先</option></select></label>
  </div>
  {searchOpen&&<form className="hs-directory-search" onSubmit={e=>{e.preventDefault();change(setQuery,draft.trim())}}>
   <label className="hs-field"><span>完整学号／工号或已激活校园用户名</span><input type="search" maxLength={40} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="姓名暂不支持全校检索"/></label><button type="submit" disabled={disabled}>查询</button>
  </form>}
  {query&&<div className="hs-directory-query">检索：{query}<button type="button" aria-label="清除全校检索" onClick={()=>{setDraft('');change(setQuery,'')}}><X size={15}/></button></div>}
  {error&&<p role="alert" className="hs-alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {mfa&&<form className="hs-directory-search" aria-label="目录身份验证" onSubmit={e=>{e.preventDefault();void verify()}}><label className="hs-field"><span>6 位动态验证码</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><button disabled={verifying||!/^\d{6}$/.test(code)}>验证身份</button></form>}
  {importStarted&&<div hidden={!importOpen}><EducationRosterWorkbench batchImport={batchImport} api={api} organizationId={organizationId} disabled={disabled} units={units.filter(u=>u.unitKind==='GRADE'||u.unitKind==='CLASS').map(u=>({...u,unitKind:u.unitKind as RosterUnit['unitKind'],parentUnitId:u.parentUnitId??null}))} onUnits={onUnits} entry={entry} onChanged={()=>setVersion(v=>v+1)}/></div>}
  {busy&&<p role="status">正在读取全校人员…</p>}
  {data&&<>
   <div className="hs-directory-meta"><span>共 {data.total} 人</span>{filtered&&<button type="button" onClick={reset}>清除筛选</button>}<details><summary>名单与状态说明</summary><p>汇总导入名单、已有学校成员及注册学生。仅合并本人已确认的账号；待确认记录保留独立条目。账号激活、成员关系和学生审批分别显示，不代表报告权限。旧记录不补造姓名。</p></details></div>
   <ul className="hs-directory-list">{data.list.map(p=><li key={p.id}>
    <button type="button" className="hs-directory-person" aria-expanded={selected===p.id} onClick={()=>choose(p.id)}>
     <span className="hs-directory-identity"><strong>{title(p)}</strong><small>{[p.kind==='STUDENT'?'学生':p.persona==='COUNSELOR'?'心理教师':'教职工',p.number&&p.name?p.number:null,p.grade,p.className].filter(Boolean).join(' · ')}</small></span>
     <span className="hs-directory-state"><span>{activation[p.activation]??'需核对'}</span><small>{p.kind==='STUDENT'&&p.admission!=='NOT_REGISTERED'?(admissions[p.admission]??'准入需核对'):membership[p.membership]}</small></span><ChevronRight size={17}/>
    </button>
    {selected===p.id&&<section className="hs-directory-detail" aria-label="人员详情">
     <div className="hs-directory-detail-heading"><strong>{title(p)}</strong><button type="button" aria-label="关闭人员详情" onClick={()=>{detailRequest.current++;setSelected('');setDetail(null);setDetailBusy(false)}}><X size={18}/></button></div>
     {detailBusy&&<p role="status">正在读取人员详情…</p>}
     {detail&&<>
      <dl><div><dt>资料来源</dt><dd>{detail.source==='IMPORTED'?'导入名单':'原有学校记录'}</dd></div><div><dt>账号状态</dt><dd>{accounts[detail.account]}</dd></div><div><dt>成员状态</dt><dd>{membership[detail.membership]}</dd></div><div><dt>校园用户名</dt><dd>{detail.username??'尚未由本人激活确认'}</dd></div>{detail.kind==='STUDENT'&&<div><dt>班级审批</dt><dd>{admissions[detail.admission]??'准入需核对'}</dd></div>}</dl>
      {detail.classes.length>0&&<div><h3>任班关系</h3><ul>{detail.classes.map((c,i)=><li key={i}>{c.grade} / {c.className} · {c.role==='HOMEROOM'?'班主任':'任课教师'}{c.pending?'（激活后生效）':''}</li>)}</ul></div>}
      {detail.personId&&detail.activation!=='ACTIVATED'&&<EducationPersonnelImport api={api} organizationId={organizationId} disabled={disabled} mode="person" onChanged={()=>{setNotice('核实结果已记录，请由本人确认激活。');setVersion(v=>v+1)}} person={{id:detail.personId,kind:detail.kind,number:detail.number??'',name:detail.name??'',persona:detail.persona,grade:detail.grade,className:detail.className,activated:false,existingAccount:detail.existingAccount} satisfies PersonnelPerson}/>}
     </>}
    </section>}
   </li>)}</ul>
   {!data.list.length&&<p className="hs-directory-empty">{filtered?'没有符合条件的人员，请调整筛选。':'当前学校暂无可展示的人员记录。'}</p>}
   <div className="hs-directory-pagination"><span>第 {page} / {Math.max(1,Math.ceil(data.total/data.pageSize))} 页</span><div className="hs-actions"><button aria-label="上一页人员" disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/>上一页</button><button aria-label="下一页人员" disabled={page*data.pageSize>=data.total||busy} onClick={()=>setPage(p=>p+1)}>下一页<ChevronRight size={17}/></button></div></div>
  </>}
 </section>
}

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react'
import {BookOpen,Search,Users,X,SlidersHorizontal,ChevronDown,RefreshCw} from 'lucide-react'
import apiClient from '../api/client'
import type {Course,User} from '../types'
import {materialGrantApi} from '../api/materialGrants'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import {useStaffFeedback} from '../components/staff-ui/useStaffFeedback'

const pageSize=20
const message=(cause:unknown)=>typeof cause==='object'&&cause!==null&&'message' in cause?String(cause.message):'请稍后重试'
const date=(value?:string)=>value?new Date(value).toLocaleDateString('zh-CN'):'—'
function courseState(course:Course){
 if(course.isLibrary)return {label:'库课程',tone:'muted'}
 if(course.status==='COMPLETED')return {label:'已结束',tone:'muted'}
 if(course.status==='DRAFT')return {label:'草稿',tone:'pending'}
 return course.isRecruiting?{label:'招募中',tone:'active'}:{label:'暂停招募',tone:'pending'}
}
type Member={id:string;username:string;nickname?:string;enrollmentStatus:string;joinedAt:string;isFrozen?:boolean}
function CourseRoster({course}:{course:Course}){
 const [rows,setRows]=useState<Member[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  let active=true;setLoading(true);setError('')
  void apiClient.get<{list:Member[]}>('/courses/'+encodeURIComponent(course.id)+'/students').then(response=>{
   if(response.code!==0)throw Error(response.message||'无法读取学员名单')
   if(active)setRows(response.data.list)
  }).catch(cause=>{if(active)setError(message(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[course.id,revision])
 return <section className="training-supervision-roster" aria-label="课程学员名单"><h3><Users size={17} aria-hidden="true"/>学员名单</h3>
  {loading?<p role="status">正在读取学员名单…</p>:error?<div role="alert" className="training-accounts-error"><span>{error}</span><button type="button" onClick={()=>setRevision(value=>value+1)}>重试名单</button></div>:rows.length===0?<p>暂无已加入或待审核的学员。</p>:<div className="training-accounts-table-wrap" role="region" aria-label="学员名单，可左右滚动" tabIndex={0}><table className="training-accounts-table"><thead><tr><th>学员账号</th><th>姓名</th><th>报名状态</th><th>加入时间</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.username}</strong>{row.isFrozen&&<small>账号已冻结</small>}</td><td>{row.nickname||'—'}</td><td>{row.enrollmentStatus==='PENDING'?'待审核':row.enrollmentStatus==='ACTIVE'?'已加入':row.enrollmentStatus==='APPROVED'?'已通过':row.enrollmentStatus}</td><td>{date(row.joinedAt)}</td></tr>)}</tbody></table></div>}
 </section>
}

/** Training oversight uses existing course contracts, without entering the trainer workspace. */
export default function TrainingAdminCourses({pageTitle}:{pageTitle?:string}={}){
 const {feedback,confirm,success,error:notifyError}=useStaffFeedback({dialogClassName:'training-accounts-dialog training-supervision-dialog'})
 const [rows,setRows]=useState<Course[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1)
 const [keyword,setKeyword]=useState(''),[status,setStatus]=useState('all'),[includeLibrary,setIncludeLibrary]=useState(true)
 const [filters,setFilters]=useState({keyword:'',status:'all',includeLibrary:true,creatorId:''})
 const [filtersOpen,setFiltersOpen]=useState(false),[creatorId,setCreatorId]=useState(''),[sort,setSort]=useState('createdAt:desc')
 const [teachers,setTeachers]=useState<User[]>([]),[teacherLoading,setTeacherLoading]=useState(false),[teacherError,setTeacherError]=useState(''),[teacherRevision,setTeacherRevision]=useState(0)
 const filterAnchor=useRef<HTMLDivElement>(null),filterButton=useRef<HTMLButtonElement>(null),filterInput=useRef<HTMLInputElement>(null)
 useEffect(()=>{
  if(!filtersOpen)return
  filterInput.current?.focus()
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!filterAnchor.current?.contains(event.target))setFiltersOpen(false)}
  document.addEventListener('pointerdown',outside)
  return()=>document.removeEventListener('pointerdown',outside)
 },[filtersOpen])
 const teachersLoaded=useRef(false)
 useEffect(()=>{
  if(!filtersOpen||teachersLoaded.current)return
  let active=true;setTeacherLoading(true);setTeacherError('')
  void materialGrantApi.listTeachers().then(response=>{
   if(response.code!==0||!response.data)throw Error(response.message||'无法读取培训师选项')
   if(active){setTeachers(response.data.list.filter(user=>user.role==='TEACHER').sort((a,b)=>a.username.localeCompare(b.username)));teachersLoaded.current=true}
  }).catch(cause=>{if(active)setTeacherError(message(cause))}).finally(()=>{if(active)setTeacherLoading(false)})
  return()=>{active=false}
 },[filtersOpen,teacherRevision])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [details,setDetails]=useState<Course|null>(null),[editing,setEditing]=useState<Course|null>(null)
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[editorError,setEditorError]=useState('')
 const request=useRef(0),operation=useRef(false),inspection=useRef<HTMLElement>(null),detailTrigger=useRef<HTMLButtonElement|null>(null)
 const detailId=details?.id
 useEffect(()=>{if(detailId){inspection.current?.focus({preventScroll:true});inspection.current?.scrollIntoView?.({block:'start',behavior:'smooth'})}},[detailId])
 const pages=Math.max(1,Math.ceil(total/pageSize))
 const fetchCourses=useCallback(async()=>{
  const sequence=++request.current;setLoading(true);setError('')
  const [sortBy,sortOrder]=sort.split(':')
  try{
   const response=await apiClient.get<{list:Course[];total:number}>('/courses',{params:{keyword:filters.keyword||undefined,status:filters.status,excludeLibrary:!filters.includeLibrary,creatorId:filters.creatorId||undefined,sortBy,sortOrder,page,pageSize}})
   if(sequence!==request.current)return
   if(response.code!==0)throw Error(response.message||'读取课程列表失败')
   setRows(response.data.list);setTotal(response.data.total)
   const last=Math.max(1,Math.ceil(response.data.total/pageSize));if(page>last)setPage(last)
  }catch(cause){if(sequence===request.current)setError(message(cause))}
  finally{if(sequence===request.current)setLoading(false)}
 },[filters,page,sort])
 useEffect(()=>{const sequence=request;void fetchCourses();return()=>{sequence.current++}},[fetchCourses])
 function apply(event:FormEvent){event.preventDefault();setPage(1);setDetails(null);setFilters({keyword:keyword.trim(),status,includeLibrary,creatorId});setFiltersOpen(false);filterButton.current?.focus()}
 function reset(){setKeyword('');setStatus('all');setIncludeLibrary(true);setCreatorId('');setPage(1);setDetails(null);setFilters({keyword:'',status:'all',includeLibrary:true,creatorId:''})}
 function edit(course:Course){setEditorError('');setEditing(course);setTitle(course.title);setDescription(course.description||'')}
 async function closeEditor(){
  if(operation.current)return
  if(editing&&(title!==editing.title||description!==(editing.description||''))){
   operation.current=true;setBusy(true)
   try{if(!await confirm({title:'放弃未保存的课程修改？',body:'本次修改尚未保存。你也可以取消并继续编辑。',confirmLabel:'放弃修改',danger:true}))return}
   finally{operation.current=false;setBusy(false)}
  }
  setEditing(null)
 }
 useEffect(()=>{
  if(!editing||(title===editing.title&&description===(editing.description||'')))return
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
 },[editing,title,description])
 async function save(event:FormEvent){
  event.preventDefault();if(!editing||operation.current||!title.trim())return
  operation.current=true;setBusy(true);setEditorError('')
  try{
   const response=await apiClient.put('/courses/'+encodeURIComponent(editing.id),{title:title.trim(),description:description.trim()})
   if(response.code!==0)throw Error(response.message||'保存失败')
   if(details?.id===editing.id)setDetails({...details,title:title.trim(),description:description.trim()})
   setEditing(null);success('课程信息已更新');await fetchCourses()
  }catch(cause){setEditorError(message(cause))}
  finally{operation.current=false;setBusy(false)}
 }
 async function execute(course:Course,action:'stop-recruiting'|'resume-recruiting'|'end'){
  if(operation.current)return
  const options={
   'stop-recruiting':{title:'暂停课程招募？',body:'暂停后，新学员无法通过课程码加入；现有学员和课程数据不受影响。',label:'确认暂停',done:'已暂停课程招募'},
   'resume-recruiting':{title:'恢复课程招募？',body:'恢复后，新学员可使用当前课程码申请加入。',label:'确认恢复',done:'已恢复课程招募'},
   end:{title:'结束这门课程？',body:'结束后停止招募，课程内容、学员账号与历史作答保留。此操作无法在本页撤销，请确认课程已完成。',label:'确认结束课程',done:'课程已结束'},
  }[action]
  operation.current=true;setBusy(true)
  try{
   if(!await confirm({title:options.title,body:<><strong>{course.title}</strong><p>{options.body}</p></>,confirmLabel:options.label,danger:action==='end'}))return
   const response=await apiClient.post('/courses/'+encodeURIComponent(course.id)+'/'+action,{})
   if(response.code!==0)throw Error(response.message||'操作失败')
   if(details?.id===course.id)setDetails({...details,isRecruiting:action==='resume-recruiting',status:action==='end'?'COMPLETED':details.status})
   success(options.done);await fetchCourses()
  }catch(cause){notifyError('课程操作未完成',message(cause))}
  finally{operation.current=false;setBusy(false)}
 }
 const tools=<div className="training-account-list-tools">
   <div className="training-account-filter-anchor training-course-filter-anchor" ref={filterAnchor}
    onKeyDown={event=>{if(event.key==='Escape'&&filtersOpen){event.preventDefault();setFiltersOpen(false);filterButton.current?.focus()}}}
    onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setFiltersOpen(false)}}>
    <button ref={filterButton} type="button" className="training-accounts-secondary training-supervision-filter-toggle" disabled={busy} aria-expanded={filtersOpen} aria-controls="training-course-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={16} aria-hidden="true"/>{filtersOpen?'收起检索':'课程检索'}<ChevronDown size={15} aria-hidden="true"/></button>
    {filtersOpen&&<section className="training-account-filter-popover training-course-filter-popover" id="training-course-filters" aria-label="课程检索">
    <form className="training-supervision-filters" onSubmit={apply}>
     <label className="training-supervision-search">搜索课程<span className="training-accounts-search-input"><Search size={17} aria-hidden="true"/><input ref={filterInput} type="search" value={keyword} disabled={busy} maxLength={200} onChange={event=>setKeyword(event.target.value)} placeholder="课程名称、介绍或课程码"/></span></label>
     <label>创建培训师<select value={creatorId} disabled={busy||teacherLoading} onChange={event=>setCreatorId(event.target.value)}><option value="">{teacherLoading?'正在读取培训师…':'全部培训师'}</option>{teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.nickname?teacher.nickname+'（'+teacher.username+'）':teacher.username}</option>)}</select></label>
     <label>课程状态<select value={status} disabled={busy} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="COMPLETED">已结束</option></select></label>
     <label className="training-supervision-library"><input type="checkbox" checked={includeLibrary} disabled={busy} onChange={event=>setIncludeLibrary(event.target.checked)}/>包含库课程</label>
     <div className="training-supervision-filter-actions"><button type="submit" disabled={busy} className="training-accounts-primary">查询</button><button type="button" disabled={busy} className="training-accounts-secondary" onClick={reset}>重置</button></div>
    </form>
    {teacherError&&<div className="training-accounts-error" role="alert"><span>{teacherError}</span><button type="button" onClick={()=>setTeacherRevision(value=>value+1)}>重试培训师选项</button></div>}
  </section>}
   </div>
   <button type="button" className="training-accounts-secondary" aria-label="刷新列表" disabled={loading||busy} onClick={()=>void fetchCourses()}><RefreshCw size={15} aria-hidden="true"/>刷新</button>
 </div>
 return <>
  {pageTitle&&<header className="training-management-page-heading training-course-page-heading training-account-page-heading training-course-controls-heading"><h1>{pageTitle}</h1>{tools}</header>}
  <section className="training-accounts training-supervision" aria-label="课程列表与监管">
  {feedback}
  <div className="training-supervision-toolbar">
    <span className="training-supervision-count">共 {total} 门课程</span>
    <label className="training-supervision-sort">排序<select value={sort} disabled={busy} onChange={event=>{setSort(event.target.value);setPage(1);setDetails(null)}}><option value="createdAt:desc">创建时间：最新在前</option><option value="createdAt:asc">创建时间：最早在前</option><option value="creator:asc">培训师账号：A–Z</option><option value="creator:desc">培训师账号：Z–A</option></select></label>
    {!pageTitle&&tools}
  </div>
  {(filters.keyword||filters.status!=='all'||!filters.includeLibrary||filters.creatorId)&&<div className="training-supervision-filter-summary"><span>{[
    filters.keyword&&'关键词：'+filters.keyword,
    filters.creatorId&&'培训师：'+(teachers.find(teacher=>teacher.id===filters.creatorId)?.nickname||teachers.find(teacher=>teacher.id===filters.creatorId)?.username||'指定培训师'),
    filters.status!=='all'&&'状态：'+({DRAFT:'草稿',PUBLISHED:'已发布',COMPLETED:'已结束'}[filters.status]||filters.status),
    !filters.includeLibrary&&'不含库课程'
  ].filter(Boolean).join(' · ')}</span><button type="button" disabled={busy} onClick={reset}>清除筛选</button></div>}
  {error&&<div className="training-accounts-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void fetchCourses()}>重新加载</button></div>}
  {loading?<p className="training-accounts-empty" role="status">正在读取课程列表…</p>:error?null:rows.length===0?<div className="training-accounts-empty"><BookOpen size={32} aria-hidden="true"/><h3>{filters.keyword||filters.status!=='all'||!filters.includeLibrary||filters.creatorId?'未找到匹配课程':'暂无培训课程'}</h3><p>可以调整筛选条件，或稍后刷新列表。</p></div>:<div className="training-accounts-table-wrap training-supervision-list-wrap" role="region" aria-label="课程列表" tabIndex={0}><table className="training-accounts-table training-supervision-table"><thead><tr><th>课程与课程码</th><th>创建者</th><th>课程状态</th><th>学员</th><th>创建时间</th><th className="training-accounts-actions-cell">管理操作</th></tr></thead><tbody>{rows.map(course=>{const state=courseState(course);return <tr key={course.id}>
   <td data-label="课程与课程码"><strong>{course.title}</strong><small className="training-supervision-code">{course.courseCode}</small></td><td data-label="创建培训师"><strong>{course.creator?.nickname||course.creator?.username||'—'}</strong><small>{course.creator?.username||'未提供创建者账号'}</small></td>
   <td data-label="课程状态"><span className={'training-accounts-status training-accounts-status--'+state.tone}>{state.label}</span>{course.isLibrary&&<small>{course.status==='DRAFT'?'草稿':course.status==='COMPLETED'?'已结束':'已发布'}</small>}</td><td data-label="学员人数">{course.studentCount??0} 人</td><td data-label="创建时间">{date(course.createdAt)}</td>
   <td data-label="管理操作" className="training-accounts-actions-cell"><details className="training-course-actions"><summary>管理操作<ChevronDown size={15} aria-hidden="true"/></summary><div className="training-course-actions-buttons"><button type="button" className="training-accounts-secondary" disabled={busy} aria-expanded={details?.id===course.id} aria-controls="training-course-inspection" onClick={event=>{detailTrigger.current=event.currentTarget;setDetails(details?.id===course.id?null:course)}}>查看</button><button type="button" className="training-accounts-secondary" disabled={busy||course.status==='COMPLETED'} onClick={()=>edit(course)}>编辑</button>
    {course.status==='PUBLISHED'&&!course.isLibrary&&<button type="button" className="training-accounts-secondary" disabled={busy} onClick={()=>void execute(course,course.isRecruiting?'stop-recruiting':'resume-recruiting')}>{course.isRecruiting?'暂停招募':'恢复招募'}</button>}
    {course.status!=='COMPLETED'&&<button type="button" className="training-supervision-end" disabled={busy} onClick={()=>void execute(course,'end')}>结束课程</button>}
   </div></details></td>
  </tr>})}</tbody></table></div>}
  {pages>1&&<div className="training-accounts-pagination"><p>共 {total} 门课程 · 第 {page} / {pages} 页</p><div><button type="button" disabled={loading||busy||page<=1} onClick={()=>{setDetails(null);setPage(value=>value-1)}}>上一页</button><button type="button" disabled={loading||busy||page>=pages} onClick={()=>{setDetails(null);setPage(value=>value+1)}}>下一页</button></div></div>}
  {details&&<section id="training-course-inspection" ref={inspection} tabIndex={-1} className="training-supervision-inspection" aria-label="课程详情与学员"><header><div><p className="training-management-eyebrow">课程信息</p><h2>{details.title}</h2></div><button type="button" className="training-accounts-secondary" onClick={()=>{setDetails(null);detailTrigger.current?.focus()}} aria-label="收起课程详情"><X size={16} aria-hidden="true"/>收起</button></header><dl><div><dt>课程码</dt><dd>{details.courseCode}</dd></div><div><dt>课程状态</dt><dd>{courseState(details).label}</dd></div><div><dt>创建者</dt><dd>{details.creator?.nickname||details.creator?.username||'—'}</dd></div><div><dt>最近更新</dt><dd>{date(details.updatedAt)}</dd></div></dl><p className="training-supervision-description">{details.description||'暂无课程介绍。'}</p><CourseRoster key={details.id} course={details}/></section>}
  <ManagementDialog open={Boolean(editing)} title="编辑课程信息" description={editing?.title} onClose={()=>void closeEditor()} closeDisabled={busy} className="training-accounts-dialog training-supervision-dialog">
   <form className="training-supervision-editor" onSubmit={event=>void save(event)}>{editorError&&<p role="alert" className="training-supervision-editor-error">{editorError}</p>}<label>课程名称<input required maxLength={200} value={title} disabled={busy} onChange={event=>setTitle(event.target.value)}/></label><label>课程介绍<textarea rows={5} maxLength={2000} disabled={busy} value={description} onChange={event=>setDescription(event.target.value)}/></label><p>仅更新课程名称与介绍，保留现有学员、任务与测试数据。</p><div><button type="button" className="training-accounts-secondary" disabled={busy} onClick={()=>void closeEditor()}>取消</button><button type="submit" className="training-accounts-primary" disabled={busy||!title.trim()||(title===editing?.title&&description===(editing?.description||''))}>{busy?'处理中…':'保存修改'}</button></div></form>
  </ManagementDialog>
 </section></>
}

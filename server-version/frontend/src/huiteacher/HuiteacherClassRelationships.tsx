import {useEffect,useState,type FormEvent} from 'react'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Member={membershipId:string;loginName:string;role:string}
type Unit={id:string;name:string;unitKind:string}
type Assignment={id:string;membershipId:string;classUnitId:string;staffRole?:'HOMEROOM'|'TEACHING';isPrimary?:boolean}
type Page={list:Assignment[];total:number}
export function HuiteacherClassRelationships({organizationId,members,units,api}:{organizationId:string;members:Member[];units:Unit[];api:Api}){
  const base='/organizations/'+organizationId
  const classes=units.filter(unit=>unit.unitKind==='CLASS')
  const [staff,setStaff]=useState<Page>({list:[],total:0}),[students,setStudents]=useState<Page>({list:[],total:0})
  const [staffPage,setStaffPage]=useState(1),[studentPage,setStudentPage]=useState(1)
  const [teacher,setTeacher]=useState(''),[student,setStudent]=useState('')
  const [staffClass,setStaffClass]=useState(''),[studentClass,setStudentClass]=useState('')
  const [staffRole,setStaffRole]=useState<'HOMEROOM'|'TEACHING'>('TEACHING'),[primary,setPrimary]=useState(true)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const listPath=(kind:'staff'|'student',page:number)=>base+'/'+kind+'-class-assignments?currentOnly=true&pageSize=25&page='+page
  const refresh=async(nextStaff=staffPage,nextStudents=studentPage)=>{
    const [a,b]=await Promise.all([api<Page>(listPath('staff',nextStaff)),api<Page>(listPath('student',nextStudents))])
    setStaff(a);setStudents(b);setStaffPage(nextStaff);setStudentPage(nextStudents)
  }
  useEffect(()=>{
    let current=true
    void Promise.all([api<Page>(base+'/staff-class-assignments?currentOnly=true&pageSize=25&page=1'),api<Page>(base+'/student-class-assignments?currentOnly=true&pageSize=25&page=1')])
      .then(([a,b])=>{if(current){setStaff(a);setStudents(b)}})
      .catch(e=>{if(current)setError(e instanceof Error?e.message:'班级关系暂时无法加载')})
    return()=>{current=false}
  },[base,api])
  const run=async(job:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('')
    try{await job()}catch(e){setError(e instanceof Error?e.message:'班级关系未能更新')}finally{setBusy(false)}
  }
  const assignStaff=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    await api(base+'/staff-class-assignments','POST',{membershipId:teacher,classUnitId:staffClass,staffRole})
    await refresh(1,studentPage);setNotice('教师任教关系已保存，学生评教现在可以选择该班级。')
  })}
  const assignStudent=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    await api(base+'/student-class-assignments','POST',{membershipId:student,classUnitId:studentClass,isPrimary:primary})
    await refresh(staffPage,1);setNotice('学生班级关系已保存，评价发布时将重新核验参与资格。')
  })}
  const end=(kind:'staff'|'student',row:Assignment)=>void run(async()=>{
    if(!window.confirm('确认结束此班级关系？后续评价会重新核验资格，已冻结的历史记录将保留。'))return
    await api(base+'/'+kind+'-class-assignments/'+row.id+'/end','POST',{})
    await refresh();setNotice('班级关系已结束，历史记录仍保留。')
  })
  const name=(id:string)=>members.find(m=>m.membershipId===id)?.loginName??'成员资料尚未加载'
  const className=(id:string)=>classes.find(c=>c.id===id)?.name??'班级资料尚未加载'
  const pagination=(kind:'staff'|'student',page:number,total:number)=><nav className="ht-inline" aria-label={kind==='staff'?'教师任教关系分页':'学生班级关系分页'}>
    <button type="button" disabled={busy||page<=1} onClick={()=>void run(()=>kind==='staff'?refresh(page-1,studentPage):refresh(staffPage,page-1))}>上一页</button>
    <span>第 {page} 页 · 共 {total} 条</span>
    <button type="button" disabled={busy||page*25>=total} onClick={()=>void run(()=>kind==='staff'?refresh(page+1,studentPage):refresh(staffPage,page+1))}>下一页</button>
  </nav>
  return <section className="ht-panel ht-class-relations" aria-label="任教与学生班级关系管理">
    <h2>任教与学生班级关系</h2>
    <p>维护学校核验的教师任教和学生班级关系。保存或结束关系需要近期 MFA 验证；请先在上方完成敏感操作验证。</p>
    {error&&<p role="alert" className="ht-notice">{error}</p>}
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    {!classes.length&&<p>请先创建班级，再设置任教和学生班级关系。</p>}
    <section aria-label="教师任教关系"><h3>教师任教</h3>
      <form className="ht-relation-form" onSubmit={assignStaff}>
        <label className="ht-field"><span>教师</span><select aria-label="教师" required value={teacher} onChange={e=>setTeacher(e.target.value)}><option value="">选择已加入学校的教师</option>{members.filter(m=>m.role==='TEACHER').map(m=><option key={m.membershipId} value={m.membershipId}>{m.loginName}</option>)}</select></label>
        <label className="ht-field"><span>任教班级</span><select aria-label="任教班级" required value={staffClass} onChange={e=>setStaffClass(e.target.value)}><option value="">选择班级</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="ht-field"><span>任教身份</span><select aria-label="任教身份" value={staffRole} onChange={e=>setStaffRole(e.target.value as 'HOMEROOM'|'TEACHING')}><option value="TEACHING">任课教师</option><option value="HOMEROOM">班主任</option></select></label>
        <button type="submit" disabled={busy||!teacher||!staffClass}>保存任教关系</button>
      </form>
      {staff.list.map(row=><div className="ht-relation-entry" key={row.id}><p>{name(row.membershipId)} · {className(row.classUnitId)} · {row.staffRole==='HOMEROOM'?'班主任':'任课教师'}</p><button type="button" disabled={busy} onClick={()=>end('staff',row)}>结束任教</button></div>)}
      {!staff.total&&<p className="ht-empty">暂无当前任教关系。</p>}{pagination('staff',staffPage,staff.total)}
    </section>
    <section aria-label="学生班级关系"><h3>学生班级</h3>
      <form className="ht-relation-form" onSubmit={assignStudent}>
        <label className="ht-field"><span>学生</span><select aria-label="学生" required value={student} onChange={e=>setStudent(e.target.value)}><option value="">选择已加入学校的学生</option>{members.filter(m=>m.role==='STUDENT').map(m=><option key={m.membershipId} value={m.membershipId}>{m.loginName}</option>)}</select></label>
        <label className="ht-field"><span>学生班级</span><select aria-label="学生班级" required value={studentClass} onChange={e=>setStudentClass(e.target.value)}><option value="">选择班级</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="ht-field"><span><input type="checkbox" checked={primary} onChange={e=>setPrimary(e.target.checked)}/>设为主要班级</span></label>
        <button type="submit" disabled={busy||!student||!studentClass}>保存学生班级</button>
      </form>
      {students.list.map(row=><div className="ht-relation-entry" key={row.id}><p>{name(row.membershipId)} · {className(row.classUnitId)}{row.isPrimary?' · 主要班级':''}</p><button type="button" disabled={busy} onClick={()=>end('student',row)}>结束班级关系</button></div>)}
      {!students.total&&<p className="ht-empty">暂无当前学生班级关系。</p>}{pagination('student',studentPage,students.total)}
    </section>
  </section>
}

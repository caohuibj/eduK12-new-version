import { useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type Unit={id:string;unitKind:'CLASS'|'GRADE';name:string}
type Staff={membershipId:string;displayName:string;canTeach:boolean;canCounsel:boolean;hasPsychology:boolean}
type Student={membershipId:string;reference:string}
type StaffAssignment={id:string;membershipId:string;classUnitId:string;staffRole:'HOMEROOM'|'TEACHING'}
type CounselingRelationship={id:string;counselorMembershipId:string;clientMembershipId:string;studentReference:string}
type Directory={
  staff:Staff[];students:Student[];staffAssignments:StaffAssignment[];
  clientRelationships:CounselingRelationship[];
  truncated:{staff:boolean;students:boolean;staffAssignments:boolean;clientRelationships:boolean}
}

export function SchoolRelationships({api,organizationId,classes}:{
  api:SchoolApi;organizationId:string;classes:Unit[]
}){
  const [classUnitId,setClassUnitId]=useState('')
  const [directory,setDirectory]=useState<Directory|null>(null)
  const [teacher,setTeacher]=useState('')
  const [staffRole,setStaffRole]=useState<StaffAssignment['staffRole']>('TEACHING')
  const [counselor,setCounselor]=useState('')
  const [student,setStudent]=useState('')
  const [endReasons,setEndReasons]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const load=async()=>{
    const q=classUnitId?'?classUnitId='+encodeURIComponent(classUnitId):''
    setDirectory(await api<Directory>('/organizations/'+organizationId+'/relationship-directory'+q))
  }
  const act=async(task:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('')
    try{await task()}
    catch(e){setError(e instanceof Error?e.message:'关系变更失败，请核实权限和当前状态')}
    finally{setBusy(false)}
  }
  const onClass=(id:string)=>{
    setClassUnitId(id);setDirectory(null);setStudent('');setTeacher('');setCounselor('');setEndReasons({})
    setNotice('');setError('')
  }
  const staff=directory?.staff??[]
  const teachers=staff.filter(s=>s.canTeach)
  const counselors=staff.filter(s=>s.canCounsel&&s.hasPsychology)
  const staffName=(id:string)=>staff.find(s=>s.membershipId===id)?.displayName??'已离职或不再符合岗位的教职员工'
  return <section className="hs-panel">
    <h2>学校管理员 · 任教与心理个案关系</h2>
    <p>仅当前学校管理员可操作。请先在上方完成最近五分钟的 TOTP 验证，再加载或修改关系。
      学生只使用校园匿名观察编号，不会在这里公开学号、登录名或心理报告。</p>
    <label className="hs-field"><span>选择班级</span>
      <select value={classUnitId} onChange={e=>onClass(e.target.value)}>
        <option value="">请选择班级（仅查看教职人员）</option>
        {classes.filter(c=>c.unitKind==='CLASS').map(c=>
          <option value={c.id} key={c.id}>{c.name}</option>)}
      </select>
    </label>
    <button disabled={busy} onClick={()=>void act(load)}>经二次验证读取关系</button>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {notice&&<p role="status" className="hs-message">{notice}</p>}
    {directory&&<>
      <p>当前目录：{staff.length} 名教职员工；当前所选班级 {directory.students.length} 名获批学生。
        账号与班级权限变更后，旧关系需要重新核验。</p>
      {Object.values(directory.truncated).some(Boolean)&&<p>有部分历史记录超出单页上限，请缩小到具体班级。</p>}
      {classUnitId&&<div className="hs-grid">
        <div>
          <h3>分配班主任／任课教师</h3>
          <label className="hs-field"><span>教师</span>
            <select value={teacher} onChange={e=>setTeacher(e.target.value)}>
              <option value="">选择当前教师</option>
              {teachers.map(s=><option value={s.membershipId} key={s.membershipId}>
                {s.displayName}</option>)}
            </select>
          </label>
          <label className="hs-field"><span>任教关系</span>
            <select value={staffRole} onChange={e=>setStaffRole(e.target.value as StaffAssignment['staffRole'])}>
              <option value="TEACHING">任课教师</option><option value="HOMEROOM">班主任</option>
            </select>
          </label>
          <button disabled={busy||!teacher} onClick={()=>void act(async()=>{
            await api('/organizations/'+organizationId+'/staff-class-assignments','POST',{
              membershipId:teacher,classUnitId,staffRole,
            })
            setTeacher('');await load();setNotice('当前任教关系已登记，历史已结束的关系不会自动恢复。')
          })}>登记任教关系</button>
        </div>
        <div>
          <h3>授权心理教师服务个案</h3>
          <p>由学校管理员建立明确的服务对象范围；此操作不自动授予家长报告或心理结果读取权。</p>
          <label className="hs-field"><span>心理教师（须持有专业能力）</span>
            <select value={counselor} onChange={e=>setCounselor(e.target.value)}>
              <option value="">选择心理教师</option>
              {counselors.map(s=><option value={s.membershipId} key={s.membershipId}>
                {s.displayName}</option>)}
            </select>
          </label>
          <label className="hs-field"><span>获批学生的校园观察编号</span>
            <select value={student} onChange={e=>setStudent(e.target.value)}>
              <option value="">选择个案学生</option>
              {directory.students.map(s=><option value={s.membershipId} key={s.membershipId}>
                {s.reference}</option>)}
            </select>
          </label>
          <button disabled={busy||!counselor||!student} onClick={()=>void act(async()=>{
            if(!window.confirm('确认存在合法的学校专业服务安排，并只为此心理教师建立当前个案关系？'))return
            await api('/organizations/'+organizationId+'/counselor-client-relationships','POST',{
              counselorMembershipId:counselor,clientMembershipId:student,
            })
            setStudent('');await load()
            setNotice('心理个案关系已建立。学生 CLIENT 能力仅在正式授权操作中创建，专业报告继续逐次核权。')
          })}>建立独立个案关系</button>
        </div>
      </div>}
      <h3>当前任教关系</h3>
      {directory.staffAssignments.length===0?<p>尚无当前任教关系。</p>:
        <div className="hs-task-list">{directory.staffAssignments.map(a=>
          <article key={a.id} className="hs-task-card">
            <p>{staffName(a.membershipId)} · {a.staffRole==='HOMEROOM'?'班主任':'任课教师'}</p>
            <button disabled={busy} onClick={()=>void act(async()=>{
              if(!window.confirm('结束此教师的当前任教关系？其后续观察任务将重新校验授权。'))return
              await api('/organizations/'+organizationId+'/staff-class-assignments/'+a.id+'/end','POST',{})
              await load();setNotice('任教关系已结束。')
            })}>结束任教关系</button>
          </article>)}</div>}
      <h3>当前专业个案关系</h3>
      {directory.clientRelationships.length===0?<p>尚无当前心理教师个案关系。</p>:
        <div className="hs-task-list">{directory.clientRelationships.map(a=>
          <article key={a.id} className="hs-task-card">
            <p>{staffName(a.counselorMembershipId)} · 学生 {a.studentReference}</p>
            <label className="hs-field"><span>结束关系原因（记录到审计）</span>
              <input value={endReasons[a.id]??''} onChange={e=>setEndReasons(current=>({...current,[a.id]:e.target.value}))} maxLength={200}/>
            </label>
            <button disabled={busy||(endReasons[a.id]?.trim().length??0)<4} onClick={()=>void act(async()=>{
              if(!window.confirm('确认结束此个案关系并停止未来专业报告访问？'))return
              await api('/organizations/'+organizationId+'/counselor-client-relationships/'+a.id+'/end',
                'POST',{reason:endReasons[a.id].trim()})
              setEndReasons(current=>{const next={...current};delete next[a.id];return next});await load()
              setNotice('个案关系已终止，专业报告的新请求必须重新通过当前关系校验。')
            })}>终止个案关系</button>
          </article>)}</div>}
    </>}
  </section>
}

import {deferredPage,KeepMountedOnVisit} from '../components/page-loading/deferredPage'

import {SchoolTaskHelp as ManagementHelp} from '../school/SchoolTaskHelp'
import {TeacherAssessmentProvider} from './TeacherAssessmentPage'

import {createEducationAssessmentFeedback} from '../components/education-tools/educationAssessmentFeedbackAdapter'

import {SCHOOL_HOST} from '../school/context'

import {usePrivateToolCapability,type PrivateDraftState} from '../components/education-tools/privateToolClient'

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {flushSync} from 'react-dom'
import {QRCodeSVG} from 'qrcode.react'
import {UserRound,X,BookOpen,Compass,FileText,ClipboardList,Sprout,UsersRound,Info,MessageSquare,TrendingUp} from 'lucide-react'
import './huiteacher.css'



import {createEducationAssessmentResourceAdapter} from '../api/educationAssessmentResourceClient'







import {HuiteacherLanding} from './HuiteacherLanding'
import './huiteacher-landing.css'
import TeacherBrand from './TeacherBrand'
import {useProductTheme} from '../components/product-theme/useProductTheme'
import {ProductThemeControl} from '../components/product-theme/ProductThemeControl'
import './huiteacher-theme.css'
import './teacher-home-refresh.css'
import './huiteacher-workspace-layout.css'
import './huiteacher-admin-layout.css'
import '../components/education-tools/education-entry-layout.css'

const EducationAssessmentRegistrationPanel=deferredPage(async()=>({default:(await import('../components/education-tools/EducationAssessmentRegistrationPanel')).EducationAssessmentRegistrationPanel}))
const EducationRosterManagement=deferredPage(async()=>({default:(await import('../components/education-roster/EducationRosterManagement')).EducationRosterManagement}))
const HuiteacherAssessmentTasks=deferredPage(async()=>({default:(await import('./HuiteacherAssessmentTasks')).HuiteacherAssessmentTasks}))
const EducationPrivateToolStudio=deferredPage(async()=>({default:(await import('../components/education-tools/EducationPrivateToolStudio')).EducationPrivateToolStudio}))
const HuiteacherMyGrowth=deferredPage(async()=>({default:(await import('./HuiteacherMyGrowth')).HuiteacherMyGrowth}))
const HuiteacherFormStudio=deferredPage(async()=>({default:(await import('./HuiteacherFormStudio')).HuiteacherFormStudio}))
const HuiteacherClassRelationships=deferredPage(async()=>({default:(await import('./HuiteacherClassRelationships')).HuiteacherClassRelationships}))
const HuiteacherEvaluationStudio=deferredPage(async()=>({default:(await import('./HuiteacherEvaluationStudio')).HuiteacherEvaluationStudio}))
const HuiteacherMyFormTasks=deferredPage(async()=>({default:(await import('./HuiteacherMyFormTasks')).HuiteacherMyFormTasks}))
const HuiteacherMyStudentFeedback=deferredPage(async()=>({default:(await import('./HuiteacherMyStudentFeedback')).HuiteacherMyStudentFeedback}))
const HuiteacherPersonalSelf=deferredPage(async()=>({default:(await import('./HuiteacherPersonalSelf')).HuiteacherPersonalSelf}))
const HuiteacherFieldWorkspace=deferredPage(async()=>({default:(await import('./HuiteacherFieldWorkspace')).HuiteacherFieldWorkspace}))
const HuiteacherConsensusReviews=deferredPage(async()=>({default:(await import('./HuiteacherConsensus')).HuiteacherConsensusReviews}))
const ReportPrivacyPreferences=deferredPage(async()=>({default:(await import('../components/report-privacy/ReportPrivacyPreferences')).ReportPrivacyPreferences}))
const ProductPasswordChange=deferredPage(async()=>({default:(await import('../components/account/ProductPasswordChange')).ProductPasswordChange}))

type Envelope<T>={code:string|number;message:string;data:T}
type Scope={organizationId:string;organizationName:string;membershipId:string;orgRole:string;productAdmin:boolean}
type Me={id:string;username:string;role:string;organizations:Scope[];product:'HUITEACHER';mustChangePassword:boolean}
type Unit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
type Mfa={mfaRequired:true;enrolled:boolean}
type Screen='home'|'join'|'login'|'mfa'|'register'|'student'|'expert'|'workspace'
type WorkspaceTab='teacher'|'school'|'expert'|'private-tools'

function cookie(name:string){
  const part=document.cookie.split('; ').find(x=>x.startsWith(name+'='))
  if(!part)return ''
  try{return decodeURIComponent(part.slice(name.length+1))}catch{return ''}
}
async function teacherApi<T>(path:string,method='GET',data?:unknown,options?:{responseType?:'blob'}):Promise<T>{
  const headers:Record<string,string>={}
  if(method!=='GET'){
    let csrf=cookie('huiteacher_csrf')
    if(!csrf){
      const resp=await fetch('/api/huiteacher/auth/csrf',{credentials:'same-origin'})
      const payload=await resp.json() as Envelope<{csrfToken:string}>
      csrf=payload.data?.csrfToken??''
    }
    if(!csrf)throw new Error('安全令牌不可用')
    headers['X-CSRF-Token']=csrf
    headers['Content-Type']='application/json'
  }
  if(data instanceof FormData)delete headers['Content-Type']
  const response=await fetch('/api/huiteacher'+path,{
    method,headers,credentials:'same-origin',
    ...(data===undefined?{}:{body:data instanceof FormData?data:JSON.stringify(data)}),
  })
  if(options?.responseType==='blob'&&response.ok)return await response.blob() as T
  const result=await response.json() as Envelope<T>
  if(!response.ok||result.code!==0)throw Object.assign(new Error(result.message||'请求未能完成'),{code:result.code,data:result.data,status:response.status,retryAfterSeconds:Number(response.headers.get('Retry-After'))||undefined})
  return result.data
}
const assessmentRuntime={renderFeedback:createEducationAssessmentFeedback({api:teacherApi,entry:'TEACHER'})}
const assessmentResources=createEducationAssessmentResourceAdapter(teacherApi,'TEACHER')
const Field=({label,value,set,type='text',required=true}:{
  label:string;value:string;set:(value:string)=>void;type?:string;required?:boolean
})=><label className="ht-field"><span>{label}</span><input
  value={value} onChange={e=>set(e.target.value)} type={type} required={required}
  autoCapitalize="none" spellCheck={false}
  autoComplete={type==='password'?(label==='设置密码'?'new-password':'current-password'):label.includes('账号')?'username':'off'}/></label>


// Keep the form mounted when closed so reopening never discards unsaved input.
function AccountDialog({open,onClose,children}:{open:boolean;onClose:()=>void;children:React.ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const target=dialog.current
    if(!target)return
    if(open&&!target.open){target.showModal();target.querySelector('h2')?.focus()}
    else if(!open&&target.open)target.close()
  },[open])
  return <dialog id="ht-account-settings" className="ht-account-dialog" ref={dialog}
    aria-labelledby="ht-account-title" onCancel={onClose} onClose={onClose}>
    <header className="ht-account-dialog-header">
      <h2 id="ht-account-title" tabIndex={-1}>账号设置</h2>
      <button type="button" className="ht-account-dialog-close" aria-label="关闭账号设置" onClick={onClose}>
        <X size={20} aria-hidden="true" focusable="false"/>
      </button>
    </header>
    {children}
  </dialog>
}
function WorkspaceJump({id,children,selected,onSelect}:{id:string;children:React.ReactNode;selected:string;onSelect:(id:string)=>void}){
  const link=useRef<HTMLAnchorElement>(null)
  useEffect(()=>{if(selected===id)link.current?.scrollIntoView?.({block:'nearest',inline:'nearest'})},[selected,id])
  return <a ref={link} href={`#${id}`} aria-current={selected===id?'location':undefined} onClick={event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
    flushSync(()=>onSelect(id))
    const target=document.getElementById(id)
    if(!target)return
    event.preventDefault();
    if(window.location.hash!==`#${id}`)window.history.pushState(null,'',`#${id}`)
    target.focus({preventScroll:true});target.scrollIntoView?.({block:'start'})
  }}>{children}</a>
}


function PersonalSpaceInfo(){
  const [open,setOpen]=useState(false)
  const pinned=useRef(false)
  const root=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node)){pinned.current=false;setOpen(false)}
    }
    document.addEventListener('pointerdown',dismiss)
    return()=>document.removeEventListener('pointerdown',dismiss)
  },[])
  return <div className="ht-workspace-info" ref={root}
    onMouseEnter={()=>setOpen(true)}
    onMouseLeave={()=>{if(!pinned.current&&!root.current?.contains(document.activeElement))setOpen(false)}}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)){pinned.current=false;setOpen(false)}}}
    onKeyDown={event=>{if(event.key==='Escape'){pinned.current=false;setOpen(false);event.stopPropagation()}}}>
    <button type="button" className="ht-workspace-info-trigger" aria-label="个人空间说明"
      aria-controls="ht-personal-space-info" aria-expanded={open}
      aria-describedby={open?'ht-personal-space-info':undefined}
      onFocus={()=>setOpen(true)} onClick={()=>{pinned.current=!pinned.current;setOpen(pinned.current)}}>
      <Info size={16} aria-hidden="true"/>
    </button>
    <p id="ht-personal-space-info" className="ht-workspace-info-copy" role="tooltip" hidden={!open}>
      个人空间 · 显示本人各学校的任务与个人测评，不随学校选择筛选。
    </p>
  </div>
}


export default function HuiteacherApp(){
  const appRoot=useRef<HTMLElement>(null)
  const [workspaceTab,setWorkspaceTab]=useState<WorkspaceTab>('teacher')
  const [personalSection,setPersonalSection]=useState('ht-personal-tasks')
  const [schoolSection,setSchoolSection]=useState('ht-school-settings')
  const historySectionFocus=useRef<string|null>(null)
  useLayoutEffect(()=>{
    if(!historySectionFocus.current)return
    document.getElementById(historySectionFocus.current)?.focus({preventScroll:true})
    historySectionFocus.current=null
  },[personalSection,schoolSection])
  const [formDraftState,setFormDraftState]=useState({dirty:false,writing:false})
  const privateDraft=useRef<PrivateDraftState>({dirty:false,writing:false})
  const practiceDraft=useRef<PrivateDraftState>({dirty:false,writing:false})
  const setPracticeDraftState=useCallback((state:PrivateDraftState)=>{practiceDraft.current=state},[])
  const setPrivateDraftState=useCallback((state:PrivateDraftState)=>{privateDraft.current=state},[])
  const canLeaveForm=()=>{
    if(privateDraft.current.writing){setMessage('私有工具正在处理，请等待完成后再离开。');return false}
    if(privateDraft.current.dirty&&!window.confirm('私有工具草稿尚未保存，确定放弃修改并离开吗？'))return false
    if(practiceDraft.current.writing){setMessage('实践记录正在保存或提交，请等待完成后再离开。');return false}
    if(practiceDraft.current.dirty&&!window.confirm('实践表单或记录尚未正式保存，确定放弃当前输入并离开吗？'))return false
    if(formDraftState.writing){setMessage('表单正在保存或发布，请等待完成后再离开。');return false}
    return !formDraftState.dirty||window.confirm('当前表单草稿尚未保存，确定放弃修改并离开吗？')
  }
  const changeWorkspaceTab=(next:WorkspaceTab)=>{
    if(next===workspaceTab||!canLeaveForm())return
    setWorkspaceTab(next)
  }
  const changeOrganization=(next:string)=>{
    if(next===selectedOrg||!canLeaveForm())return
    setSelectedOrg(next)
  }
  const [screen,setScreen]=useState<Screen>(()=>['/login','/participate'].includes(window.location.pathname)?'login':'home')
  const [me,setMe]=useState<Me|null>(null)
  const appearance=useProductTheme('teacher',me?.id)
  const [loading,setLoading]=useState(true)
  const [working,setWorking]=useState(false)
  const [accountOpen,setAccountOpen]=useState(false)
  useEffect(()=>{
    const previousTitle=document.title
    const icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const previousIcon=icon?.getAttribute('href')
    const previousType=icon?.getAttribute('type')
    document.title='Teacher · 教师发展与学校改进'
    if(icon){icon.href='/huiteacher/huiteacher-b3-emblem.svg';icon.type='image/svg+xml'}
    return ()=>{
      document.title=previousTitle
      if(icon){
        if(previousIcon!==null&&previousIcon!==undefined)icon.setAttribute('href',previousIcon)
        if(previousType!==null&&previousType!==undefined)icon.setAttribute('type',previousType)
      }
    }
  },[])
  useEffect(()=>{
    if(loading||screen==='workspace')return
    const heading=appRoot.current?.querySelector<HTMLElement>(screen==='home'?'.ht-journal h1':'.ht-form-panel h1')
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
  },[screen,loading])
  const [assessmentPageOpen,setAssessmentPageOpen]=useState(false)
  const [message,setMessage]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [inviteCode,setInviteCode]=useState('')
  const [studentNumber,setStudentNumber]=useState('')
  const [classId,setClassId]=useState('')
  const [mfaCode,setMfaCode]=useState('')
  const [mfaUri,setMfaUri]=useState('')
  const [mfaEnrolled,setMfaEnrolled]=useState(true)
  const [recoveryCodes,setRecoveryCodes]=useState<string[]>([])
  const [selectedOrg,setSelectedOrg]=useState('')
  const canAuthorPrivateTools=usePrivateToolCapability(teacherApi,selectedOrg,me&&!me.mustChangePassword?me.id:undefined)
  const [storedUnits,setUnits]=useState<Unit[]>([])
  const [storedMembers,setMembers]=useState<Array<{membershipId:string;loginName:string;role:string}>>([])
  const [newUnitName,setNewUnitName]=useState('')
  const [newUnitType,setNewUnitType]=useState<'GRADE'|'CLASS'>('GRADE')
  const [newUnitParent,setNewUnitParent]=useState('')
  const [issuedInvite,setIssuedInvite]=useState('')
  const [roster,setRoster]=useState('')
  const [issuedStudentInvites,setIssuedStudentInvites]=useState<Array<{studentNumber:string;inviteCode:string}>>([])

  const reload=async()=>{
    const user=await teacherApi<Me>('/auth/me')
    setMe(user)
    setSelectedOrg(previous=>user.organizations.some(x=>x.organizationId===previous)
      ?previous:user.organizations[0]?.organizationId??'')
    setScreen('workspace')
  }
  useEffect(()=>{
    let alive=true
    teacherApi<Me>('/auth/me').then(user=>{
      if(!alive)return
      setMe(user);setSelectedOrg(user.organizations[0]?.organizationId??'');setScreen('workspace')
    }).catch(()=>{}).finally(()=>{if(alive)setLoading(false)})
    return ()=>{alive=false}
  },[])
  const run=(work:()=>Promise<void>)=>{
    setMessage('');setWorking(true)
    void work().catch(e=>setMessage(e instanceof Error?e.message:'操作失败')).finally(()=>setWorking(false))
  }
  const login=()=>run(async()=>{
    const response=await teacherApi<(Mfa|{user:{id:string};product:string})>(
      '/auth/login','POST',{username,password},
    )
    setPassword('')
    if('mfaRequired' in response&&response.mfaRequired){
      setMfaEnrolled(response.enrolled);setMfaUri('');setScreen('mfa')
    }else await reload()
  })
  const mfa= (step:'setup'|'confirm'|'verify'|'recovery')=>run(async()=>{
    if(step==='setup'){
      const data=await teacherApi<{otpauthUri:string}>('/auth/mfa/setup','POST',{})
      setMfaUri(data.otpauthUri)
      return
    }
    const data=await teacherApi<{recoveryCodes?:string[]}>('/auth/mfa/'+step,'POST',{code:mfaCode})
    setMfaCode('');setMfaUri('')
    if(data.recoveryCodes?.length)setRecoveryCodes(data.recoveryCodes)
    else await reload()
  })
  const changeScreen=(next:Screen)=>{
    if(!canLeaveForm())return
    setMessage('');setScreen(next)
    if(next==='home')window.history.pushState(null,'','/')
    if(next==='home'||next==='workspace')window.scrollTo({top:0})
  }
  const org=me?.organizations.find(o=>o.organizationId===selectedOrg)??null
  const directoryKey=me&&org?`${me.id}:${org.organizationId}:${org.productAdmin}`:''
  const [directory,setDirectory]=useState({key:'',pending:false,error:'',loaded:false})
  const units=directory.key===directoryKey?storedUnits:[]
  const members=directory.key===directoryKey?storedMembers:[]
  const directoryPending=directory.key!==directoryKey||directory.pending
  useEffect(()=>{
    if(!me||!org||me.role==='STUDENT'||me.mustChangePassword||screen!=='workspace'||workspaceTab!=='school'||!org.productAdmin){setUnits([]);setMembers([]);setDirectory({key:'',pending:false,error:'',loaded:false});return}
    setDirectory(previous=>({key:directoryKey,pending:true,error:'',loaded:previous.key===directoryKey&&previous.loaded}))
    let active=true
    void Promise.all([
      teacherApi<{list:Unit[]}>(`/organizations/${org.organizationId}/units`),
      teacherApi<{list:typeof storedMembers}>(`/organizations/${org.organizationId}/members`),
    ]).then(([unitData,memberData])=>{
      if(!active)return
      setUnits(unitData.list);setMembers(memberData.list);setDirectory({key:directoryKey,pending:false,error:'',loaded:true})
    }).catch(error=>{if(active)setDirectory(previous=>({...previous,key:directoryKey,pending:false,error:error instanceof Error?error.message:'学校名单暂不可读取'}))})
    return ()=>{active=false}
  },[me,selectedOrg,org?.organizationId,org?.productAdmin,screen,workspaceTab,directoryKey])
  const refreshOrg=()=>run(async()=>{
    await reload()
  })
  const createUnit=()=>run(async()=>{
    if(!org?.productAdmin)return
    const params=newUnitType==='GRADE'
      ?{unitKind:'GRADE',name:newUnitName}
      :{unitKind:'CLASS',name:newUnitName,parentUnitId:newUnitParent}
    await teacherApi(`/organizations/${org.organizationId}/units`,'POST',params)
    setNewUnitName('');setUnits((await teacherApi<{list:Unit[]}>(`/organizations/${org.organizationId}/units`)).list)
    setMessage('年级或班级已建立')
  })
  const invite=()=>run(async()=>{
    if(!org)return
    const code=await teacherApi<{inviteCode:string}>(`/organizations/${org.organizationId}/staff-invitations`,'POST',{})
    setIssuedInvite(code.inviteCode);setMessage('邀请已生成：请安全交付，页面只展示本次结果')
  })
  const stepUp=()=>run(async()=>{
    await teacherApi('/auth/mfa/step-up','POST',{code:mfaCode})
    setMfaCode('');setMessage('管理员动态验证码已确认，5 分钟内可以继续敏感操作')
  })
  const studentRegistration=()=>run(async()=>{
    await teacherApi('/education/register-student','POST',{
      username,password,studentNumber,inviteCode,
    })
    setPassword('');setInviteCode('');setScreen('login');setMessage('教育账号已创建，请登录。')
  })
  const expertRegistration=()=>run(async()=>{
    await teacherApi('/education/register-expert','POST',{
      username,password,inviteCode,
    })
    setPassword('');setInviteCode('')
    setScreen('login')
    setMessage('教育账号已创建，请登录领取观察任务。')
  })
  const staffRegistration=()=>run(async()=>{
    await teacherApi('/education/register-staff','POST',{
      username,password,inviteCode,
    })
    setPassword('');setMessage('账号已建立，可以使用同一教育账号登录')
    setScreen('login')
  })
  const joinStaff=()=>run(async()=>{
    await teacherApi('/education/join-staff','POST',{inviteCode})
    setInviteCode('');await reload();setMessage('已使用现有教育账号加入学校')
  })
  const joinStudent=()=>run(async()=>{
    await teacherApi('/education/join-student','POST',{inviteCode,studentNumber})
    setInviteCode('');await reload()
    setMessage('已使用原学生账号加入 Teacher 学校，心理健康权限不变')
  })
  const issueStudentCodes=()=>run(async()=>{
    if(!org||!classId)throw new Error('请先选择班级')
    const studentNumbers=roster.split(/[\s,，]+/).map(x=>x.trim()).filter(Boolean)
    if(!studentNumbers.length)throw new Error('请填写已核验学号')
    const result=await teacherApi<{list:Array<{studentNumber:string;inviteCode:string}>}>(
      `/organizations/${org.organizationId}/classes/${classId}/student-invitations`,
      'POST',{studentNumbers},
    )
    setIssuedStudentInvites(result.list)
    setMessage('Teacher 学生邀请已生成，须按学号逐一安全交付；不会自动开通 School 心理健康业务')
  })
  const changeAccountPassword=(oldPassword:string,newPassword:string)=>run(async()=>{
    await teacherApi('/auth/change-password','POST',{oldPassword,newPassword})
    setAccountOpen(false);setMe(null);setSelectedOrg('');setScreen('login')
    setMessage('教育账号密码已修改，School 和 Teacher 需要分别重新登录')
  })
  const logout=()=>{
    if(!canLeaveForm())return
    run(async()=>{
    await teacherApi('/auth/logout','POST',{})
    setAccountOpen(false);setMe(null);setSelectedOrg('');setScreen('home');setMessage('')
    })
  }
  useEffect(()=>{
    const restoreSection=(event?:Event)=>{
      const fragment=window.location.hash.slice(1)||(workspaceTab==='school'?'ht-school-settings':'ht-personal-tasks')
      const id=['ht-personal-forms','ht-personal-private-forms','ht-personal-scales'].includes(fragment)?'ht-personal-tasks':fragment
      // A fragment can only select an already-authorized, mounted section.
      const target=document.getElementById(id)
      if(!target?.classList.contains('ht-workspace-section'))return
      if(event){
        if(target.hidden)historySectionFocus.current=id
        else target.focus({preventScroll:true})
      }
      if(id.startsWith('ht-personal-'))setPersonalSection(id)
      if(id.startsWith('ht-school-'))setSchoolSection(id)
    }
    restoreSection()
    window.addEventListener('popstate',restoreSection)
    window.addEventListener('hashchange',restoreSection)
    return ()=>{window.removeEventListener('popstate',restoreSection);window.removeEventListener('hashchange',restoreSection)}
  },[workspaceTab,loading,me?.id,selectedOrg])
  const publicHome=screen==='home'
  const publicAuth=!me&&screen!=='home'
  const workspaceNavigation=Boolean(me&&screen==='workspace'&&!me.mustChangePassword&&me.role!=='STUDENT'&&!assessmentPageOpen)
  const compactWorkspaceHeader=workspaceNavigation||assessmentPageOpen||Boolean(me&&screen==='workspace'&&!me.mustChangePassword&&me.role==='STUDENT')
  return <main ref={appRoot} className={`ht-app${!me||publicHome?' ht-app-public':''}${me?' ht-app-signed-in':''}${publicHome?' ht-app-landing':''}`} data-theme={appearance.theme}>
    <a className="ht-skip-link" href="#ht-main-content">跳到主要内容</a>
    <header className={`ht-topbar${compactWorkspaceHeader?' ht-topbar-workspace':''}`}>
      <button type="button" className="ht-brand-home" aria-label="Teacher 首页"
        onClick={()=>changeScreen('home')}><TeacherBrand/></button>
      {workspaceNavigation&&me&&<div className="ht-header-workspaces">
      <div className="ht-workspace-switcher">
      <nav className="ht-workspace-tabs" aria-label="Teacher 工作台">
        <button type="button" aria-pressed={workspaceTab==='teacher'}
          onClick={()=>changeWorkspaceTab('teacher')}><BookOpen size={18} aria-hidden="true"/>教师成长</button>
        {me.role!=='STUDENT'&&<button type="button" aria-pressed={workspaceTab==='private-tools'} onClick={()=>changeWorkspaceTab('private-tools')}><FileText size={18} aria-hidden="true"/>我的工具</button>}
        {me.organizations.some(o=>o.productAdmin)&&<button type="button"
          aria-pressed={workspaceTab==='school'}
          onClick={()=>changeWorkspaceTab('school')}><UsersRound size={18} aria-hidden="true"/>学校改进</button>}
        <button type="button" aria-pressed={workspaceTab==='expert'}
          onClick={()=>changeWorkspaceTab('expert')}><Compass size={18} aria-hidden="true"/>专业实践</button>
      </nav>
      {workspaceTab==='teacher'&&<PersonalSpaceInfo/>}
      </div>
      </div>}
      <nav className="ht-account-actions" aria-label="产品导航">
        {!me&&<>
          {!publicHome&&<button className="ht-home-entry" type="button" onClick={()=>changeScreen('home')}>首页</button>}
          <button type="button" className="ht-login-entry" aria-current={screen==='login'?'page':undefined} onClick={()=>changeScreen('login')}>登录</button>
          <button type="button" className="ht-register-entry" aria-current={['join','register','student','expert'].includes(screen)?'page':undefined}
            onClick={()=>changeScreen('join')}>注册</button>
        </>}
        {me&&<><span className="ht-welcome">{me.username}</span>
          {!me.mustChangePassword&&<button type="button" className="ht-account-entry"
            aria-label="账号设置" title="账号设置与修改密码" aria-controls="ht-account-settings" aria-haspopup="dialog" onClick={()=>{setMessage('');setAccountOpen(true)}}>
            <UserRound size={20} aria-hidden="true" focusable="false"/>
          </button>}
          <button onClick={()=>void logout()} disabled={working}>退出</button></>}
        <ProductThemeControl appearance={appearance} product="Teacher"/>
      </nav>
    </header>
    {message&&!accountOpen&&<p role="status" className="ht-notice">{message}</p>}
    <div id="ht-main-content" tabIndex={-1} className={publicAuth?'ht-auth-surface':'ht-page-content'}>
    {publicHome?<HuiteacherLanding theme={appearance.theme} onEnter={()=>changeScreen(me?'workspace':'login')}/>:
    loading?<section className="ht-panel ht-session-loading" aria-live="polite"><p>正在检查教育账号登录状态…</p></section>:
    !me&&screen==='join'?<section className="ht-panel ht-form-panel">
      <h1>受邀创建教育账号</h1>
      <p>选择与你收到的邀请相符的身份，<br/>我们会引导你完成注册。</p>
      <div className="ht-invite-choices" role="group" aria-label="邀请身份">
        <button type="button" onClick={()=>changeScreen('register')}>教师／学校成员<span aria-hidden="true">→</span></button>
        <button type="button" onClick={()=>changeScreen('student')}>学生<span aria-hidden="true">→</span></button>
        <button type="button" onClick={()=>changeScreen('expert')}>外部专家<span aria-hidden="true">→</span></button>
      </div>
      <p className="ht-muted">邀请码由学校或项目提供。</p>
      <div className="ht-auth-switch">已有教育账号？<button type="button" onClick={()=>changeScreen('login')}>直接登录</button></div>
    </section>:
    !me&&screen==='login'?<section className="ht-panel ht-form-panel"><h1>登录 Teacher</h1>
      <p>使用已有教育账号，进入你的发展空间。</p>
      <form onSubmit={e=>{e.preventDefault();login()}}>
        <Field label="教育账号" value={username} set={setUsername}/>
        <Field label="密码" value={password} set={setPassword} type="password"/>
        <button className="ht-primary" disabled={working}>{working?'正在登录…':'登录'}</button></form>
      <div className="ht-auth-switch">还没有教育账号？<button type="button" onClick={()=>changeScreen('join')}>使用邀请注册</button></div>
      <div className="ht-account-guide">
        <p>教师、学校管理者、学生与专家，均使用教育账号登录。</p>

      </div>
      <p className="ht-muted">Huischool 与 Huiteacher 使用同一教育账号，需分别登录。</p>
    </section>:
    !me&&screen==='mfa'?<section className="ht-panel ht-form-panel"><h1>双因素验证</h1>
      <p>为保护学校管理权限，请使用身份验证器完成登录。</p>
      {!mfaEnrolled&&<button disabled={working} onClick={()=>mfa('setup')}>设置身份验证器</button>}
      {mfaUri&&<div className="ht-mfa-setup">
        <p>使用身份验证器扫描二维码，再输入 6 位动态验证码。</p>
        <QRCodeSVG value={mfaUri} size={164} marginSize={2} title="身份验证器设置二维码"/>
        <details><summary>无法扫描？手动添加</summary><code className="ht-wrap ht-mfa-uri">{mfaUri}</code></details>
      </div>}
      <Field label="验证码或恢复码" value={mfaCode} set={setMfaCode}/>
      <button className="ht-primary" disabled={working} onClick={()=>mfa(mfaEnrolled?'verify':'confirm')}>完成验证</button>
      {mfaEnrolled&&<button disabled={working} onClick={()=>mfa('recovery')}>使用恢复码</button>}
      {recoveryCodes.length>0&&<div className="ht-secret"><strong>请离线保存恢复码；仅此时展示</strong>
        <pre>{recoveryCodes.join('\n')}</pre><button onClick={()=>{setRecoveryCodes([]);void reload()}}>我已保存</button></div>}
    </section>:
    !me&&(screen==='register'||screen==='student'||screen==='expert')?<section className="ht-panel ht-form-panel">
      <button type="button" className="ht-auth-back" onClick={()=>changeScreen('join')}>← 选择其他邀请身份</button>
      <h1>{screen==='register'?'教师邀请注册':screen==='expert'?'外部专家受控注册':'学生评教身份注册'}</h1>
      <p>{screen==='expert'
        ?'使用学校或项目提供的专家邀请码，创建教育账号。'
        :screen==='register'
          ?'使用学校提供的教师邀请码，创建教育账号。'
          :'使用学校提供的学生邀请码和核验学号，创建教育账号。'}</p>
      <form onSubmit={e=>{e.preventDefault();
        if(screen==='student')studentRegistration()
        else if(screen==='expert')expertRegistration()
        else staffRegistration()
      }}>
        {screen==='student'&&<Field label="学校核验的学号" value={studentNumber} set={setStudentNumber}/>}
        <Field label={screen==='student'?'Teacher 学生邀请代码':screen==='expert'?'限定活动的专家邀请码':'教师邀请代码'}
          value={inviteCode} set={setInviteCode}/>
        <Field label="教育账号登录名" value={username} set={setUsername}/>
        <Field label="设置密码" value={password} set={setPassword} type="password"/>
        <button className="ht-primary" disabled={working}>注册统一教育账号</button></form>
      <p className="ht-muted">已有教育账号？<button type="button" onClick={()=>changeScreen('login')}>直接登录</button></p>
    </section>:
    me&&screen==='workspace'&&me.mustChangePassword?<section className="ht-panel ht-form-panel">
      <h1>首次登录 · 修改教育账号密码</h1>
      <ProductPasswordChange product="teacher" forced busy={working} onChangePassword={changeAccountPassword}/>
    </section>:
    me&&screen==='workspace'?<TeacherAssessmentProvider onActiveChange={setAssessmentPageOpen} scope={me.role==='STUDENT'?'ht-personal-tasks':workspaceTab==='teacher'?personalSection:workspaceTab==='expert'?'ht-professional-practice':'other'}><div className={'ht-workspace'+(me.role==='STUDENT'?' ht-student-workspace':workspaceTab==='school'?' ht-workspace-admin':'')} hidden={assessmentPageOpen}>
      <section className="ht-workspace-header">
        <div className="ht-workspace-heading">
          <h1>我的教育发展空间</h1>
          <p className="ht-workspace-welcome">欢迎，{me.username}</p>
        </div>
      </section>
      {me.role==='STUDENT'?<HuiteacherMyFormTasks student api={teacherApi}/>:
      <>

      {workspaceTab==='private-tools'&&selectedOrg&&<EducationAssessmentRegistrationPanel key={'registration:'+me.id+':'+selectedOrg} api={teacherApi} organizationId={selectedOrg} actorId={me.id} product="TEACHER"/>}
      {workspaceTab==='private-tools'&&(canAuthorPrivateTools?<><aside className="ht-panel" aria-label="学生测评编制入口提示"><p className="ht-muted">此处自编工具用于 Teacher 教师测评。心理教师为学生编制量表、表单及发布活动，请前往 School 的“我的工具”和活动管理。学校须已开通 School，并授予本人对应权限；使用同一教育账号单独登录，两个入口的私有草稿与固定版本不会自动互通。</p><a href={`https://${SCHOOL_HOST}/login`} target="_blank" rel="noopener noreferrer">前往 School 编制学生测评</a></aside><EducationPrivateToolStudio key={`TEACHER:${me.id}:${selectedOrg}`} api={teacherApi} organizationId={selectedOrg} entry="TEACHER" actorId={me.id} onDraftStateChange={setPrivateDraftState}/></>:<section className="ht-panel"><h2>我的工具</h2><p>当前账号或学校暂无私有量表与表单编制权限。</p></section>)}
      {workspaceTab==='teacher'&&<>
        <div className="ht-workspace-body">
        <nav className="ht-workspace-jumps" aria-label="个人任务分区">
          <span className="ht-workspace-nav-label">我的任务</span>
          <WorkspaceJump id="ht-personal-tasks" selected={personalSection} onSelect={setPersonalSection}><ClipboardList size={18} aria-hidden="true"/>参与测评</WorkspaceJump>
          <WorkspaceJump id="ht-personal-self" selected={personalSection} onSelect={setPersonalSection}><Sprout size={18} aria-hidden="true"/>个人测评</WorkspaceJump>
          {import.meta.env.VITE_HUITEACHER_STUDENT_FEEDBACK_ENABLED==='true'&&<WorkspaceJump id="ht-personal-feedback" selected={personalSection} onSelect={setPersonalSection}><MessageSquare size={18} aria-hidden="true"/>学生反馈</WorkspaceJump>}
          {import.meta.env.VITE_HUITEACHER_IMPROVEMENT_ENABLED==='true'&&<WorkspaceJump id="ht-personal-growth" selected={personalSection} onSelect={setPersonalSection}><TrendingUp size={18} aria-hidden="true"/>我的成长</WorkspaceJump>}
        </nav>
        <div className="ht-workspace-sections">
        <section id="ht-personal-self" hidden={personalSection!=='ht-personal-self'} className="ht-workspace-section" tabIndex={-1} aria-label="个人测评"><KeepMountedOnVisit key={me.id} active={personalSection==='ht-personal-self'}><HuiteacherPersonalSelf api={teacherApi}/></KeepMountedOnVisit></section>
        <section id="ht-personal-tasks" hidden={personalSection!=='ht-personal-tasks'} className="ht-workspace-section" tabIndex={-1} aria-label="参与测评"><KeepMountedOnVisit key={me.id} active={personalSection==='ht-personal-tasks'}><HuiteacherAssessmentTasks key={me.id} actorKey={me.id} api={teacherApi} assessmentRuntime={assessmentRuntime}/></KeepMountedOnVisit></section>
        {import.meta.env.VITE_HUITEACHER_STUDENT_FEEDBACK_ENABLED==='true'
          &&<section id="ht-personal-feedback" hidden={personalSection!=='ht-personal-feedback'} className="ht-workspace-section" tabIndex={-1} aria-label="学生反馈"><KeepMountedOnVisit key={me.id} active={personalSection==='ht-personal-feedback'}><HuiteacherMyStudentFeedback api={teacherApi}/></KeepMountedOnVisit></section>}
        {import.meta.env.VITE_HUITEACHER_IMPROVEMENT_ENABLED==='true'
          &&<section id="ht-personal-growth" hidden={personalSection!=='ht-personal-growth'} className="ht-workspace-section" tabIndex={-1} aria-label="我的成长"><KeepMountedOnVisit key={me.id} active={personalSection==='ht-personal-growth'}><HuiteacherMyGrowth api={teacherApi}/></KeepMountedOnVisit></section>}
        </div></div>
      </>}
      {workspaceTab==='school'&&org?.productAdmin&&<>
      <div className="ht-management-context ht-section-heading"><span>管理范围：<strong>{org.organizationName}</strong></span><ManagementHelp label="学校管理范围说明" buttonText=""><p>此处仅管理本校已授权的成员、工具与活动。</p><p>Teacher 管理授权和 School 人员管理授权分别校验，测评发布不会自动开放个人报告。</p></ManagementHelp></div>
      <div className="ht-workspace-body">
      <nav className="ht-workspace-jumps" aria-label="学校管理分区">
        <WorkspaceJump id="ht-school-settings" selected={schoolSection} onSelect={setSchoolSection}>学校设置与成员</WorkspaceJump>
        <WorkspaceJump id="ht-school-relationships" selected={schoolSection} onSelect={setSchoolSection}>班级关系</WorkspaceJump>
        <WorkspaceJump id="ht-school-evaluations" selected={schoolSection} onSelect={setSchoolSection}>评价活动</WorkspaceJump>
        <WorkspaceJump id="ht-school-forms" selected={schoolSection} onSelect={setSchoolSection}>学校表单</WorkspaceJump>
      </nav>
      <div className="ht-workspace-sections">
      {import.meta.env.VITE_REPORT_PRIVACY_PREFERENCES_V1_ENABLED==='true'&&<details className="ht-panel">
        <summary>评价与报告隐私偏好（只需设置一次）</summary>
        <ReportPrivacyPreferences key={org.organizationId} organizationId={org.organizationId}
          scenarios={['TEACHER_STUDENT_EVALUATION','TEACHER_ADULT_FORM_GROUP']} api={teacherApi}/>
      </details>}
      {org&&<section id="ht-school-settings" hidden={schoolSection!=='ht-school-settings'} className="ht-panel ht-workspace-section" tabIndex={-1} aria-label="学校设置与成员">
        <h2>{org.organizationName}</h2>{directoryPending&&<p role="status">正在读取学校名单…</p>}{directory.error&&<p role="alert">{directory.error}</p>}<p>{org.productAdmin?'已获得本校 Teacher 管理权限':'已获得本校 Teacher 参与权限'}</p>
        {me.role!=='STUDENT'&&<><h3>年级与班级 <span className="ht-count">{units.length}</span></h3>{!directoryPending&&!directory.error&&!units.length&&<p className="ht-muted">暂无年级和班级，可通过批量导入或手动创建添加。</p>}<div className="ht-units">{units.map(u=><span key={u.id} className="ht-tag">{u.unitKind==='GRADE'?'年级':'班级'} · {u.name}</span>)}</div></>}
        {me.role!=='STUDENT'&&org.productAdmin&&<div className="ht-admin">
          <details className="ht-admin-action"><summary>敏感操作验证</summary><div className="ht-inline ht-admin-mfa"><Field label="近期 MFA 验证码" value={mfaCode} set={setMfaCode}/>
            <button disabled={working||!mfaCode} onClick={stepUp}>重新验证敏感操作</button></div></details>
          <EducationRosterManagement api={teacherApi} organizationId={org.organizationId} units={units} onUnits={setUnits} disabled={working||directoryPending||!!directory.error} entry="TEACHER"/>
          <details className="ht-admin-action"><summary>学校成员邀请</summary>
          <button disabled={working} onClick={invite}>签发教师邀请</button>
          {issuedInvite&&<p className="ht-secret">一次性邀请码：<code className="ht-wrap">{issuedInvite}</code></p>}
          </details>
          <details className="ht-admin-action"><summary>手动创建年级或班级</summary>
          <div className="ht-inline"><label className="ht-field"><span>类型</span><select value={newUnitType} onChange={e=>setNewUnitType(e.target.value as 'GRADE'|'CLASS')}>
            <option value="GRADE">年级</option><option value="CLASS">班级</option></select></label>
            <Field label="名称" value={newUnitName} set={setNewUnitName}/>
            {newUnitType==='CLASS'&&<label className="ht-field"><span>所属年级</span><select value={newUnitParent} onChange={e=>setNewUnitParent(e.target.value)}>
              <option value="">请选择</option>{units.filter(u=>u.unitKind==='GRADE').map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select></label>}
            <button disabled={working||directoryPending||!!directory.error||!newUnitName||newUnitType==='CLASS'&&!newUnitParent} onClick={createUnit}>创建</button></div>
          </details>
          <details className="ht-admin-action"><summary>学生身份与班级关系</summary>
          <p>Teacher 学生加入是共享教育身份的基础成员授权；不会产生 School 心理健康的班级审批。</p>
          <label className="ht-field"><span>班级</span><select value={classId} onChange={e=>setClassId(e.target.value)}>
            <option value="">请选择班级</option>{units.filter(u=>u.unitKind==='CLASS').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select></label>
          <label className="ht-field"><span>已核验学生学号（以空格／换行分隔）</span><textarea value={roster} onChange={e=>setRoster(e.target.value)}/></label>
          <button disabled={working||directoryPending||!!directory.error||!roster||!classId} onClick={issueStudentCodes}>按学号签发 Teacher 学生邀请</button>
          {issuedStudentInvites.length>0&&<div className="ht-secret">
            <strong>本次邀请码仅显示一次，请按对应学号安全交付</strong>
            <div className="ht-members">{issuedStudentInvites.map(item=><p key={item.inviteCode}>
              学号 {item.studentNumber}：<code className="ht-wrap">{item.inviteCode}</code>
            </p>)}</div></div>}
          </details>
          <details className="ht-admin-action"><summary>Teacher 当前已授权成员（{members.length}）</summary><div className="ht-members">{members.map(m=><span key={m.membershipId} className="ht-tag">{m.loginName} · {m.role}</span>)}</div></details>
          <button onClick={refreshOrg} disabled={working}>刷新学校信息</button>
        </div>}
      </section>}
        <section id="ht-school-relationships" hidden={schoolSection!=='ht-school-relationships'} className="ht-workspace-section" tabIndex={-1} aria-label="班级关系"><KeepMountedOnVisit key={me.id+':'+org.organizationId} active={schoolSection==='ht-school-relationships'}>{directory.key===directoryKey&&directory.loaded&&<fieldset disabled={directoryPending||!!directory.error} style={{border:0,margin:0,padding:0,minWidth:0}}><HuiteacherClassRelationships key={'relations:'+org.organizationId}
          organizationId={org.organizationId} members={members} units={units} api={teacherApi}/></fieldset>}{(directoryPending||directory.error)&&<p role={directory.error?'alert':'status'}>{directory.error||'正在读取学校名单…'}</p>}</KeepMountedOnVisit></section>
        <section id="ht-school-evaluations" hidden={schoolSection!=='ht-school-evaluations'} className="ht-workspace-section" tabIndex={-1} aria-label="评价活动"><KeepMountedOnVisit key={me.id+':'+org.organizationId} active={schoolSection==='ht-school-evaluations'}><HuiteacherEvaluationStudio key={'targets:'+me.id+':'+org.organizationId}
          organizationId={org.organizationId} api={teacherApi} assessmentResources={schoolSection==='ht-school-evaluations'?assessmentResources:undefined} canAuthorPrivateTools={canAuthorPrivateTools} actorKey={me.id}/></KeepMountedOnVisit></section>
        <section id="ht-school-forms" hidden={schoolSection!=='ht-school-forms'} className="ht-workspace-section" tabIndex={-1} aria-label="学校表单"><KeepMountedOnVisit key={me.id+':'+org.organizationId} active={schoolSection==='ht-school-forms'}><HuiteacherFormStudio key={'forms:'+org.organizationId}
          organizationId={org.organizationId} api={teacherApi} onDraftStateChange={setFormDraftState}/></KeepMountedOnVisit></section>
      </div></div>
      </>}
      {workspaceTab==='expert'&&<>
        <p className="ht-workspace-context"><Compass size={16} aria-hidden="true"/><span>专业实践 · 现场观察、专业反馈与同行协作</span></p>
        <div className="ht-practice-layout">
          <HuiteacherFieldWorkspace api={teacherApi} onDraftStateChange={setPracticeDraftState}/>
          <HuiteacherConsensusReviews api={teacherApi}/>
        </div>
      </>}
      </>}
      {me.organizations.length>0&&<div className="ht-workspace-school">
        {me.role==='STUDENT'?<div className="ht-student-schools"><span>已加入学校</span><div>{me.organizations.map(school=><span key={school.organizationId}>{school.organizationName}</span>)}</div></div>:
        <label className="ht-field"><span>当前学校管理范围</span><select value={selectedOrg} onChange={e=>changeOrganization(e.target.value)}>
          {me.organizations.map(o=><option key={o.organizationId} value={o.organizationId}>{o.organizationName}</option>)}
        </select></label>}
      </div>}
    </div></TeacherAssessmentProvider>:null}
    </div>
    {me&&!me.mustChangePassword&&<>
        <AccountDialog open={accountOpen} onClose={()=>setAccountOpen(false)}>
        <p className="ht-muted">Teacher 学校业务必须经学校开通及本人授权；Huischool 数据不在此显示。</p>
        {message&&<p role="status" className="ht-notice">{message}</p>}
        <section className="ht-account-dialog-section" aria-labelledby="ht-password-title">
          <h3 id="ht-password-title">修改密码</h3>
          <ProductPasswordChange product="teacher" busy={working} onChangePassword={changeAccountPassword}/>
        </section>
        <section className="ht-account-dialog-section" aria-labelledby="ht-invite-title">
        <h3 id="ht-invite-title">学校邀请</h3>
        <div className="ht-inline"><Field label="已收到的学校邀请代码" value={inviteCode} set={setInviteCode}/>
          {me.role==='STUDENT'?<><Field label="学校核验学号" value={studentNumber} set={setStudentNumber}/>
            <button onClick={joinStudent} disabled={working||!inviteCode||!studentNumber}>使用原学生账号加入</button></>
           :<button onClick={joinStaff} disabled={working||!inviteCode}>使用已有教师账号加入</button>}</div>
        {me.organizations.length===0&&<p className="ht-empty">{me.role==='STUDENT'
          ?'当前没有开通 Huiteacher 的学生评教任务；请使用本校正式邀请补齐学生资格。'
          :'当前没有开通 Huiteacher 的学校任务授权。若拥有个人 Scale 许可，可前往教师成长工作台。'}</p>}
        </section>
        </AccountDialog>
    </>}
    <footer className="ht-footer">{publicHome?`© ${new Date().getFullYear()} Teacher`:'Teacher · 教师发展与学校改进'}</footer>
  </main>
}

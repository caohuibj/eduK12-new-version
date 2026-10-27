import {EducationPrivateToolStudio} from '../components/education-tools/EducationPrivateToolStudio'
import {usePrivateToolCapability,type PrivateDraftState} from '../components/education-tools/privateToolClient'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { UserRoundPen } from 'lucide-react'
import './school.css'
import './school-workspace.css'
import { useProductTheme } from '../components/product-theme/useProductTheme'
import { ProductThemeControl } from '../components/product-theme/ProductThemeControl'
import { SchoolMark } from './SchoolMark'
import { SchoolWorkspaceShell, SchoolWorkspaceOverview } from './SchoolWorkspaceShell'
import {SchoolProfessionalHome,SchoolProfessionalNavigation,SchoolProfessionalClassScope} from './SchoolProfessionalWorkspace'
import {SchoolProfessionalAdmission,SchoolAdmissionProgress} from './SchoolProfessionalAdmission'
import {SchoolPersonnelDirectory} from './SchoolPersonnelDirectory'
import {SchoolPersonnelClaim} from './SchoolPersonnelImport'
import {SchoolAdminPanel,SchoolAdminSections} from './SchoolAdministratorWorkspace'
import {SchoolReportHeader} from './SchoolReportPresentation'
import { canManageSchoolActivities, canReadSchoolClasses, schoolNavigation, workspaceHref, workspacePage, workspacePath } from './school-navigation'
import { schoolFeatures } from './school-features'
import { SchoolLanding, SchoolPublicHeader, SchoolCodeRegistration, type SchoolRegistrationEntry } from './SchoolLanding'
import { SchoolStudentRecovery, SchoolRecoveryOfficer } from './SchoolRecovery'
import { SchoolActivityManager } from './SchoolActivityManager'
import { schoolClassApprovalReasons } from './school-activity-workflow'
import { ReportPrivacyPreferences } from '../components/report-privacy/ReportPrivacyPreferences'
import { ProductPasswordChange } from '../components/account/ProductPasswordChange'
import {SchoolLearnerHome,SchoolLearnerMenu} from './SchoolLearnerHome'
import { SchoolStudentTasks } from './SchoolStudentTasks'
import { SchoolTeacherTasks } from './SchoolTeacherTasks'
import { SchoolRelationships } from './SchoolRelationships'
import { SchoolGroupReports } from './SchoolGroupReports'
import { SchoolProtectedReportStudio } from './SchoolProtectedReportStudio'
import { SchoolIndividualLongitudinalStudio } from './SchoolIndividualLongitudinalStudio'
import { SchoolGroupLongitudinal } from './SchoolGroupLongitudinal'
import { SchoolParentRegistration, SchoolParentLinks } from './SchoolParentPortal'
import { SchoolParentTasks } from './SchoolParentTasks'
import { SchoolPeerConsent } from './SchoolPeerConsent'
import { SchoolStudentFeedback, SchoolStudentReportConsent, SchoolParentReports, SchoolReportOfficer, SchoolDisclosureOfficers, SchoolProfessionalReports } from './SchoolReports'

import './school-theme.css'
import './school-home-refresh.css'
import './school-header-actions.css'
import './school-task-refresh.css'
import './school-task-detail.css'
import './school-educator.css'
import './school-parent.css'
import './school-professional.css'
import './school-administrator.css'
import '../components/education-tools/education-entry-layout.css'
import './school-private-tools.css'
import './school-compact-navigation.css'
import './school-administrator-polish.css'
import './school-secondary-pages.css'

type CampusUser={id:string;username:string;role:string;accountDomain:'SCHOOL';mustChangePassword:boolean}
type CampusOrg={id:string;name:string;orgRole:string}
type SchoolAccess={orgRole:string|null;canGovern:boolean;personas:string[];capabilities:string[];explicitDenies:string[]}
type Unit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
type Summary={status:string;rosterVersion:number;rosterExpectedCount:number;eligibleCount:number;registeredCount:number;unresolvedIncidents:number}
type Envelope<T>={code:number|string;message:string;data:T}
type MfaState={mfaRequired:true;enrolled:boolean}
const cookie=(name:string)=>{
  const key=encodeURIComponent(name)+'='
  const item=document.cookie.split('; ').find(value=>value.startsWith(key))
  return item?decodeURIComponent(item.slice(key.length)):null
}
async function api<T>(path:string,method='GET',payload?:unknown,options?:{responseType?:'blob'}):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=cookie('huischool_csrf')
    if(!csrf){
      const response=await fetch('/api/campus/auth/csrf',{credentials:'same-origin'})
      if(!response.ok)throw new Error('无法建立安全请求，请刷新页面')
      const body=await response.json() as Envelope<{csrfToken:string}>
      csrf=body.data?.csrfToken??null
    }
    if(!csrf)throw new Error('安全令牌不可用')
    headers['X-CSRF-Token']=csrf
  }
  if(payload instanceof FormData)delete headers['Content-Type']
  const response=await fetch('/api/campus'+path,{
    method,headers,credentials:'same-origin',
    ...(payload===undefined?{}:{body:payload instanceof FormData?payload:JSON.stringify(payload)}),
  })
  if(options?.responseType==='blob'&&response.ok)return await response.blob() as T
  const result=await response.json() as Envelope<T>
  if(!response.ok||result.code!==0)throw Object.assign(new Error(result.message||'请求失败，请稍后重试'),{code:result.code,data:result.data,status:response.status,retryAfterSeconds:Number(response.headers.get('Retry-After'))||undefined})
  return result.data
}
const field=(label:string,value:string,onChange:(v:string)=>void,type='text')=>(
  <label className="hs-field"><span>{label}</span>
    <input value={value} onChange={event=>onChange(event.target.value)} type={type}
      autoComplete={type==='password'?'off':'off'} required />
  </label>
)
export default function SchoolApp(){
  const [page,setPage]=useState(()=>workspacePage(window.location.pathname))
  const [user,setUser]=useState<CampusUser|null>(null)
  const appearance=useProductTheme('school',user?.id)
  const [loading,setLoading]=useState(true)
  const [screen,setScreen]=useState<'home'|'code'|'recruit'|'feature'|'login'|'register'|'staff'|'recover'|'parent'|'mfa'|'workspace'>(()=>
    ['/register','/staff/register','/parent/register'].includes(window.location.pathname)?'code':
      window.location.pathname==='/login'?'login':
      window.location.pathname==='/recover'?'recover':
      schoolFeatures.some(feature=>feature.path===window.location.pathname)?'feature':'home')
  const activeFeature=schoolFeatures.find(feature=>feature.path===window.location.pathname)
  const [focusPublic,setFocusPublic]=useState(false)
  const [staffRole,setStaffRole]=useState<'TEACHER'|'COUNSELOR'|'ADMIN'>('TEACHER')
  const [landingSection,setLandingSection]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [studentNo,setStudentNo]=useState('')
  const [activationCode,setActivationCode]=useState('')
  const [inviteCode,setInviteCode]=useState('')
  const [schoolId,setSchoolId]=useState(new URLSearchParams(window.location.search).get('organizationId')??'')
  const canAuthorPrivateTools=usePrivateToolCapability(api,schoolId,user&&!user.mustChangePassword?user.id:undefined)
  const privateDraft=useRef<PrivateDraftState>({dirty:false,writing:false})
  const setPrivateDraftState=useCallback((state:PrivateDraftState)=>{privateDraft.current=state},[])
  const canLeavePrivateTools=()=>{
    if(privateDraft.current.writing){setNotice('工具正在处理，请等待完成后再离开。');return false}
    return !privateDraft.current.dirty||window.confirm('私有工具草稿尚未保存，确定放弃修改并离开吗？')
  }
  const acceptedWorkspaceUrl=useRef(window.location.href)
  const [classId,setClassId]=useState(new URLSearchParams(window.location.search).get('classUnitId')??'')
  const [mfaEnrolled,setMfaEnrolled]=useState(true)
  const [mfaCode,setMfaCode]=useState('')
  const [stepUpCode,setStepUpCode]=useState('')
  const [mfaUri,setMfaUri]=useState('')
  const [recoveryCodes,setRecoveryCodes]=useState<string[]>([])
  const [orgs,setOrgs]=useState<CampusOrg[]>([])
  const [access,setAccess]=useState<SchoolAccess|null>(null)
  const [units,setUnits]=useState<Unit[]>([])
  const [gradeName,setGradeName]=useState('')
  const [className,setClassName]=useState('')
  const [parentGrade,setParentGrade]=useState('')
  const [roster,setRoster]=useState('')
  const [summary,setSummary]=useState<Summary|null>(null)
  const [windowEnd,setWindowEnd]=useState('')
  const [issuedCodes,setIssuedCodes]=useState<string[]>([])
  const [staffPersona,setStaffPersona]=useState<'TEACHER'|'COUNSELOR'>('TEACHER')
  const [staffPsych,setStaffPsych]=useState(false)
  const [staffAdmin,setStaffAdmin]=useState(false)
  const [newInvite,setNewInvite]=useState('')
  const [studentStatus,setStudentStatus]=useState('')
  const [campusParentReportEnabled,setCampusParentReportEnabled]=useState(false)
  const [working,setWorking]=useState(false)

  const refresh=async()=>{
    try{
      const me=await api<CampusUser>('/auth/me')
      setUser(me);setScreen('workspace')
    }catch{setUser(null)}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  useEffect(()=>{
    const pop=()=>{
      if(!canLeavePrivateTools()){window.history.pushState(null,'',acceptedWorkspaceUrl.current);return}
      const query=new URLSearchParams(window.location.search)
      const organizationId=query.get('organizationId')
      if(organizationId)setSchoolId(organizationId)
      setClassId(query.get('classUnitId')??'');setSummary(null);setIssuedCodes([])
      setPage(workspacePage(window.location.pathname));setError('');setNotice('');window.scrollTo({top:0,behavior:'instant'})
    }
    window.addEventListener('popstate',pop)
    return()=>window.removeEventListener('popstate',pop)
  },[])
  useEffect(()=>{acceptedWorkspaceUrl.current=window.location.href},[page,schoolId,classId])
  const navigateWorkspace=(id:string,importKind?:'GRADE'|'CLASS')=>{
    if((id===page&&!importKind)||!canLeavePrivateTools())return
    const query=new URLSearchParams()
    if(schoolId)query.set('organizationId',schoolId)
    if(classId)query.set('classUnitId',classId)
    if(importKind)query.set('importKind',importKind)
    const suffix=query.size?'?'+query.toString():''
    window.history.pushState(null,'',workspacePath(id)+suffix)
    setPage(id);setError('');setNotice('');window.scrollTo({top:0,behavior:'instant'})
  }

  useEffect(()=>{const previous=document.title;document.title=screen==='feature'&&activeFeature?`${activeFeature.title} | School`:'School';return()=>{document.title=previous}},[screen,activeFeature])
  useEffect(()=>{
    if(!user||user.mustChangePassword){setCampusParentReportEnabled(false);return}
    let live=true
    void api<{parentReportsEnabled:boolean}>('/reports/availability')
      .then(status=>{if(live)setCampusParentReportEnabled(status.parentReportsEnabled===true)})
      .catch(()=>{if(live)setCampusParentReportEnabled(false)})
    return ()=>{live=false}
  },[user])
  useEffect(()=>{
    if(!user||user.mustChangePassword)return
    void api<{list:CampusOrg[]}>('/organizations').then(data=>{
      const list=data.list??[]
      setOrgs(list)
      if(list.length)setSchoolId(prev=>prev||list[0].id)
    }).catch(()=>setOrgs([]))
    if(user.role==='STUDENT'){
      void api<{status:string;organizationId:string|null}>('/my-status').then(result=>{
        setStudentStatus(result.status)
        if(result.organizationId)setSchoolId(old=>old||result.organizationId!)
      })
        .catch(()=>setStudentStatus('暂时无法读取当前状态'))
    }
  },[user])
  useEffect(()=>{
    if(!user||user.mustChangePassword||!schoolId)return
    setClassId(new URLSearchParams(window.location.search).get('organizationId')===schoolId?new URLSearchParams(window.location.search).get('classUnitId')??'':'');setUnits([]);setSummary(null);setIssuedCodes([]);setAccess(null)
    void api<{access:SchoolAccess}>(`/organizations/${schoolId}/context`)
      .then(async data=>{
        setAccess(data.access)
        if(canReadSchoolClasses(data.access)){
          const result=await api<{list:Unit[]}>(`/organizations/${schoolId}/units`)
          setUnits(result.list??[])
        }
      }).catch(()=>{setAccess(null);setUnits([])})
  },[schoolId,user])
  const schoolAdmin=access?.orgRole==='ORG_ADMIN' && access.canGovern===true
  const psychologyStaff=!!access?.personas.includes('COUNSELOR')
    && !!access?.capabilities.includes('PSYCHOLOGY_STAFF')
    && !access?.explicitDenies.some(x=>['*','PSYCHOLOGY_STAFF','CLASS_APPROVE','ORGANIZATION_GOVERNANCE'].includes(x))
  const ordinaryTeacher=user?.role==='TEACHER'&&!schoolAdmin&&!psychologyStaff
  const parentWorkspace=user?.role==='PARENT'
  const professionalWorkspace=user?.role==='TEACHER'&&psychologyStaff
  const administratorWorkspace=(user?.role==='TEACHER'||user?.role==='ADMIN')&&schoolAdmin
  const groupedWorkspace=professionalWorkspace||administratorWorkspace
  const educatorEntries=user?schoolNavigation(user.role,studentStatus,access,campusParentReportEnabled,canAuthorPrivateTools).filter(item=>!['overview','account'].includes(item.id)):[]
  const singleTeacherTaskPage=ordinaryTeacher&&educatorEntries.length===1&&educatorEntries[0].id==='tasks'
  const workspaceHome=singleTeacherTaskPage?'tasks':'overview'
  useEffect(()=>{
    if(!singleTeacherTaskPage||page!=='overview'||screen!=='workspace'||user?.mustChangePassword)return
    const query=new URLSearchParams()
    if(schoolId)query.set('organizationId',schoolId)
    if(classId)query.set('classUnitId',classId)
    window.history.replaceState(null,'',workspacePath('tasks')+(query.size?'?'+query.toString():''))
    setPage('tasks')
  },[singleTeacherTaskPage,page,screen,user?.mustChangePassword,schoolId,classId])
  const notify=(message:string)=>{setNotice(message);setError('')}
  const run=async(work:()=>Promise<void>)=>{
    setError('');setNotice('');setWorking(true)
    try{await work()}catch(e){setError(e instanceof Error?e.message:'操作失败')}
    finally{setWorking(false)}
  }
  const signIn=async(e:React.FormEvent)=>{
    e.preventDefault()
    await run(async()=>{
      const result=await api<{user?:CampusUser}&Partial<MfaState>>('/auth/login','POST',{username,password})
      setPassword('')
      if(result.mfaRequired){
        setMfaEnrolled(result.enrolled??true);setScreen('mfa');setMfaUri('');setMfaCode('')
        notify('账号密码已验证，请完成动态验证码验证')
      }else{await refresh()}
    })
  }
  const registerStudent=async(e:React.FormEvent)=>{
    e.preventDefault()
    await run(async()=>{
      await api('/register','POST',{organizationId:schoolId,classUnitId:classId,
        studentNumber:studentNo,activationCode,username,password})
      setPassword('');setStudentNo('');setActivationCode('')
      setScreen('login')
      notify('注册成功。班级统一审批前不会开放校园任务。')
    })
  }
  const registerStaff=async(e:React.FormEvent)=>{
    e.preventDefault()
    await run(async()=>{
      await api('/staff/register','POST',{inviteCode,username,password})
      setInviteCode('');setPassword('');setScreen('login')
      notify('账号已创建。请登录，并按照提示绑定验证器。')
    })
  }
  const beginMfa=()=>run(async()=>{
    const result=await api<{otpauthUri:string}>('/auth/mfa/setup','POST',{})
    setMfaUri(result.otpauthUri)
  })
  const completeMfa=(kind:'confirm'|'verify'|'recovery')=>run(async()=>{
    const result=await api<{authenticated:boolean;recoveryCodes?:string[]}>(`/auth/mfa/${kind}`,'POST',{code:mfaCode})
    if(result.recoveryCodes?.length){setRecoveryCodes(result.recoveryCodes);notify('请立即妥善保存恢复码。恢复码只显示一次。')}
    else{setRecoveryCodes([]);await refresh()}
    setMfaUri('');setMfaCode('')
  })
  const changeAccountPassword=(oldPassword:string,newPassword:string)=>{void run(async()=>{
    await api('/auth/change-password','POST',{oldPassword,newPassword})
    setUser(null);setPassword('');setScreen('login')
    notify('密码已修改，所有 School／Teacher 会话失效，请重新登录')
  })}
  const logOut=()=>run(async()=>{
    if(!canLeavePrivateTools())return
    // Do not claim logout or clear the UI on a failed server-side revocation.
    await api('/auth/logout','POST',{})
    setUser(null);setSummary(null);setIssuedCodes([]);setRecoveryCodes([])
    window.history.replaceState(null,'','/');setPage('overview');setScreen('home');notify('已退出校园账号')
  })
  const stepUp=()=>run(async()=>{
    await api('/auth/mfa/step-up','POST',{code:stepUpCode})
    setStepUpCode('')
    notify('高权限操作已重新验证，有效期五分钟。')
  })
  const createUnit=(kind:'GRADE'|'CLASS')=>run(async()=>{
    const body=kind==='GRADE'?{unitKind:kind,name:gradeName}:{unitKind:kind,name:className,parentUnitId:parentGrade}
    await api(`/organizations/${schoolId}/units`,'POST',body)
    const result=await api<{list:Unit[]}>(`/organizations/${schoolId}/units`)
    setUnits(result.list);setGradeName('');setClassName('')
    notify(kind==='GRADE'?'年级已建立':'班级已建立')
  })
  const loadSummary=()=>run(async()=>{
    setSummary(await api<Summary>(`/organizations/${schoolId}/classes/${classId}/summary`))
  })
  const changeSchool=(id:string)=>{
    if(id===schoolId||!canLeavePrivateTools())return
    const query=new URLSearchParams(window.location.search)
    if(id)query.set('organizationId',id)
    else query.delete('organizationId')
    query.delete('classUnitId')
    window.history.replaceState(null,'',window.location.pathname+(query.size?'?'+query.toString():''))
    setSchoolId(id)
  }
  const changeClass=async(id:string)=>{
    const query=new URLSearchParams(window.location.search)
    if(schoolId)query.set('organizationId',schoolId)
    if(id)query.set('classUnitId',id)
    else query.delete('classUnitId')
    window.history.replaceState(null,'',window.location.pathname+'?'+query.toString())
    setClassId(id);setSummary(null);setIssuedCodes([]);setNewInvite('')
  }
  const joinUrl=classId?`${window.location.origin}/register?organizationId=${encodeURIComponent(schoolId)}&classUnitId=${encodeURIComponent(classId)}`:''
  const classPath=`/organizations/${schoolId}/classes/${classId}`
  const saveRoster=()=>run(async()=>{
    const studentNumbers=roster.split(/[\r\n,，]+/).map(v=>v.trim()).filter(Boolean)
    await api(classPath+'/roster','POST',{studentNumbers})
    setRoster('');setSummary(await api<Summary>(classPath+'/summary'))
    notify('资格名册已更新。服务端仅保存受保护的资格索引。')
  })
  const issueCodes=()=>run(async()=>{
    const codes=await api<{codes:string[]}>(classPath+'/codes','POST',{count:Math.max(1,Number(summary?.eligibleCount??1)),ttlMinutes:120})
    setIssuedCodes(codes.codes);notify('注册码仅在本次页面显示，请分别安全交付。')
  })
  const actionWindow=(action:'OPEN'|'CLOSE')=>run(async()=>{
    await api(classPath+'/window','POST',{action,...(action==='OPEN'?{closesAt:new Date(windowEnd).toISOString()}:{})})
    setSummary(await api<Summary>(classPath+'/summary'));notify(action==='OPEN'?'注册窗口已开启':'注册窗口已关闭')
  })
  const approve=()=>run(async()=>{
    if(!summary)throw new Error('请先刷新班级状态')
    await api(classPath+'/approve','POST',{expectedRosterVersion:summary.rosterVersion})
    setSummary(await api<Summary>(classPath+'/summary'))
    notify('班级整体审批完成。未正式开放的校园 Activity 仍不可访问。')
  })
  const invite=()=>run(async()=>{
    const result=await api<{inviteCode:string}>(`/organizations/${schoolId}/staff-invitations`,'POST',{
      persona:staffPersona,adminRole:staffAdmin,psychologyStaff:staffPsych,
    })
    setNewInvite(result.inviteCode);notify('人员邀请码仅显示一次，请通过独立安全渠道交付。')
  })

  // Public forms use server-controlled identity, permissions and MFA.
  const goPublic=(next:'home'|'code'|'recruit'|'login')=>{
    if(window.location.pathname.startsWith('/workspace')||schoolFeatures.some(feature=>feature.path===window.location.pathname))window.history.replaceState(null,'','/')
    setError('');setNotice('');setLandingSection(null);setFocusPublic(true);setScreen(next)
    if(next==='code'){setInviteCode('');setActivationCode('');setPassword('')}
    window.scrollTo({top:0,behavior:'instant'})
  }
  const codeResolved=(entry:SchoolRegistrationEntry,code:string)=>{
    setError('');setNotice('');setFocusPublic(true)
    if(entry.kind==='STUDENT'){
      setSchoolId(entry.organizationId);setClassId(entry.classUnitId);setActivationCode(code);setScreen('register')
    }else if(entry.kind==='PARENT'){setInviteCode(code);setScreen('parent')}
    else{setInviteCode(code);setStaffRole(entry.role);setScreen('staff')}
  }
  const explore=(id:string)=>{goPublic('home');setLandingSection(id)}
  useEffect(()=>{
    if(loading||screen!=='home'||!landingSection)return
    const target=document.getElementById(landingSection)
    target?.scrollIntoView({behavior:'instant',block:'start'})
    target?.focus({preventScroll:true})
    setLandingSection(null)
  },[loading,screen,landingSection])
  useEffect(()=>{
    if(!focusPublic||loading)return
    const heading=document.querySelector<HTMLElement>('#hs-main h1')
    heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true})
    setFocusPublic(false)
  },[focusPublic,screen,loading])
  const publicHome=!user&&screen==='home'
  const publicAuth=!user&&['login','code','register','staff','parent','recover','mfa'].includes(screen)

  const professionalClassPage=professionalWorkspace&&!schoolAdmin&&page==='classes'
  const professionalAdmissionPage=professionalWorkspace&&!schoolAdmin&&page==='admission'
  const professionalRecoveryPage=groupedWorkspace&&page==='recovery'
  const administratorClassPage=administratorWorkspace&&page==='classes'
  const administratorPersonnelPage=administratorWorkspace&&page==='personnel'
  const initialImportKind=new URLSearchParams(window.location.search).get('importKind')
  const administratorAdmissionPage=administratorWorkspace&&page==='admission'
  const professionalScopePage=professionalClassPage||professionalAdmissionPage||professionalRecoveryPage||administratorClassPage||administratorAdmissionPage||administratorPersonnelPage
  const classApprovalDisabled=working||!summary||summary.status!=='CLOSED'
    ||summary.rosterExpectedCount!==summary.eligibleCount||summary.eligibleCount!==summary.registeredCount||summary.unresolvedIncidents!==0
  const contextSecurity=(schoolAdmin||psychologyStaff)&&<a className="hs-context-security" href="/workspace/account" onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace('account')}}>账号安全验证 →</a>
  const workspaceContext=page!=='overview'&&page!=='account'&&(user?.role==='TEACHER'||user?.role==='ADMIN')?<section className="hs-workspace-context" aria-label="当前学校和班级">
    {!professionalScopePage&&contextSecurity}
    <label><span>当前学校</span><select value={schoolId} onChange={e=>changeSchool(e.target.value)}><option value="">请选择学校</option>{orgs.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
    {['classes','admission','recovery'].includes(page)&&<label><span>当前班级</span><select value={classId} onChange={e=>void changeClass(e.target.value)}><option value="">请选择班级</option>{units.filter(x=>x.unitKind==='CLASS').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    {professionalScopePage&&contextSecurity}
  </section>:undefined

  const managementLinks=(id:string)=><nav className="hs-management-actions" aria-label={id==='classes'?'班级相关事务':'关系与授权事务'}>{educatorEntries.filter(item=>item.parentId===id).map(item=><a key={item.id} href={workspaceHref(item.id)} onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace(item.id)}}><item.icon size={17} aria-hidden="true"/>{item.label}</a>)}</nav>

  return <div className={`hs-app${user?' hs-workspace':''}${user?.role==='STUDENT'?' hs-learner':''}${ordinaryTeacher?' hs-educator':''}${parentWorkspace?' hs-parent':''}${groupedWorkspace?' hs-professional':''}${administratorWorkspace?' hs-school-admin':''}`} data-theme={appearance.theme}>
    <a className="hs-skip-link" href="#hs-main">跳到主要内容</a>
    {!user?<SchoolPublicHeader onHome={()=>goPublic('home')} onLogin={()=>goPublic('login')}
      onRegister={()=>goPublic('code')} onExplore={explore} home={publicHome} appearance={appearance}/>:<header className="hs-header">
      <a href={workspaceHref(workspaceHome)} className="hs-workspace-brand" onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace(workspaceHome)}}><SchoolMark/></a>
      {(ordinaryTeacher||parentWorkspace)&&educatorEntries.length>1&&<nav className="hs-educator-navigation" aria-label="校园功能入口">
        {educatorEntries.map(item=><a key={item.id} href={workspaceHref(item.id)} aria-current={page===item.id?'page':undefined}
          onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace(item.id)}}><item.icon size={18} aria-hidden="true"/>{item.label}</a>)}
      </nav>}
      {groupedWorkspace&&<SchoolProfessionalNavigation items={educatorEntries} page={page} onNavigate={navigateWorkspace}/>}
      <nav className="hs-account-actions" aria-label="校园导航">
        <span className="hs-account">{user.username}</span>
        {user.role==='STUDENT'&&<SchoolLearnerMenu items={schoolNavigation(user.role,studentStatus,access,campusParentReportEnabled,canAuthorPrivateTools)} onNavigate={navigateWorkspace}/>}
        <a className="hs-profile-entry" href={workspaceHref('account')} aria-label="个人信息编辑" title="个人信息编辑"
          aria-current={page==='account'?'page':undefined}
          onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace('account')}}>
          <UserRoundPen size={19} aria-hidden="true"/>
        </a>
        <button type="button" onClick={()=>void logOut()}>退出</button>
        <ProductThemeControl appearance={appearance} product="School"/>
      </nav>
    </header>}
    <main id="hs-main" tabIndex={-1} className={`hs-main${publicHome?' hs-main-landing':publicAuth?' hs-main-auth':user?' hs-main-workspace':''}`}>
      {error&&<p className="hs-alert" role="alert">{error}</p>}
      {notice&&<p className="hs-message" role="status">{notice}</p>}
      {loading?<p>正在核对校园会话…</p>:null}
      {!loading&&publicHome&&<SchoolLanding theme={appearance.theme} onJoin={()=>goPublic('recruit')}/>}
      {!loading&&!user&&screen==='code'&&<SchoolCodeRegistration api={api} onResolved={codeResolved} onLogin={()=>goPublic('login')}/>}
      {!loading&&!user&&screen==='feature'&&activeFeature&&<section className="hs-feature-blank" aria-label={`${activeFeature.title}介绍页面`}>
        <h1 className="hs-visually-hidden">{activeFeature.title}</h1>
      </section>}
      {!loading&&!user&&screen==='recruit'&&<section className="hs-recruit-blank" aria-label="学校招募页面"><h1 className="hs-visually-hidden">学校招募</h1></section>}
      {!loading&&!user&&['register','staff','parent'].includes(screen)&&<button className="hs-auth-back" type="button" onClick={()=>goPublic('code')}>← 更换注册码</button>}
      {!loading&&!user&&screen==='login'&&<section className="hs-panel hs-narrow">
        <p className="hs-section-kicker">欢迎回到 School</p>
        <h1>校园账号登录</h1>
        <p className="hs-auth-intro">使用校园用户名和密码登录，进入你的校园空间。</p>
        <form onSubmit={e=>void signIn(e)}>
          <label className="hs-field"><span>用户名</span><input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="请输入校园用户名" required/></label>
          <label className="hs-field"><span>密码</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="请输入密码" required/></label>
          <button className="hs-primary" disabled={working}>{working?'正在登录…':'登录'}</button>
        </form>
        <p className="hs-auth-help">请使用校园账号；需要安全验证时，登录后会继续引导。</p>
        <div className="hs-auth-switch"><span>还没有校园账号？</span><button type="button" onClick={()=>goPublic('code')}>使用注册码注册</button></div>
        <button type="button" className="hs-link hs-recovery-link" onClick={()=>setScreen('recover')}>忘记校园账号或密码</button>
      </section>}
      {!loading&&!user&&screen==='register'&&<section className="hs-panel hs-narrow">
        <h1>创建学生账号</h1><p>注册码已确认。填写学号，设置你的用户名和密码。</p>
        <form onSubmit={e=>void registerStudent(e)}>
          {field('学号（仅用于资格验证）',studentNo,setStudentNo)}
          {field('自选登录名',username,setUsername)}
          {field('自选密码',password,setPassword,'password')}
          <button className="hs-primary" disabled={working}>提交注册</button>
        </form>
      </section>}
      {!loading&&!user&&screen==='recover'&&<SchoolStudentRecovery api={api}
        onComplete={()=>{setScreen('login');notify('校园密码已更新，请重新登录。')}}/>}
      {!loading&&!user&&screen==='parent'&&<SchoolParentRegistration api={api} resolvedInviteCode={inviteCode}
        onRegistered={()=>{setScreen('login');notify('校园家长账号已建立，请等待孩子确认后再参与家校测评。')}}/>}
      {!loading&&!user&&screen==='staff'&&<section className="hs-panel hs-narrow">
        <h1>{staffRole==='ADMIN'?'创建学校管理员账号':staffRole==='COUNSELOR'?'创建心理教师账号':'创建教师账号'}</h1>
        <p>注册码已确认。设置你的校园用户名和密码。</p>
        <form onSubmit={e=>void registerStaff(e)}>
          {field('自选校园用户名',username,setUsername)}
          {field('密码',password,setPassword,'password')}
          <button className="hs-primary" disabled={working}>创建校园账号</button>
        </form>
      </section>}
      {!loading&&!user&&screen==='mfa'&&<section className="hs-panel hs-narrow">
        <h1>账号安全验证</h1>
        <p>学校管理员和具有专业敏感权限的人员必须完成密码 + TOTP 动态验证码登录。</p>
        {!mfaEnrolled&&<div><button onClick={()=>void beginMfa()} disabled={working}>开始绑定验证器</button>
          {mfaUri&&<div className="hs-secret"><p>在 Microsoft Authenticator 或 Google Authenticator 中手动添加密钥（勿截图或分享）：</p><code>{new URL(mfaUri).searchParams.get('secret')}</code></div>}
        </div>}
        <form onSubmit={e=>{e.preventDefault();void completeMfa(mfaEnrolled?'verify':'confirm')}}>
          {field('6 位动态验证码',mfaCode,setMfaCode)}
          <button className="hs-primary" disabled={working}>{mfaEnrolled?'完成登录':'确认绑定并登录'}</button>
        </form>
        {mfaEnrolled&&<button className="hs-link" onClick={()=>void completeMfa('recovery')}>使用一次性恢复码代替动态验证码</button>}
      </section>}
      {!loading&&recoveryCodes.length>0&&<section className="hs-panel hs-narrow">
        <h2>请离线保存一次性恢复码</h2><p>此列表不会再次显示。不要保存到浏览器本地存储或共享设备。</p>
        <div className="hs-secret">{recoveryCodes.map(code=><code key={code}>{code}</code>)}</div>
        <button className="hs-primary" onClick={()=>{setRecoveryCodes([]);void refresh()}}>已妥善保存，进入校园</button>
      </section>}
      {!loading&&user&&screen==='workspace'&&user.mustChangePassword&&recoveryCodes.length===0&&<section className="hs-panel hs-narrow">
        <h1>首次登录 · 修改密码</h1>
        <ProductPasswordChange product="school" forced busy={working} onChangePassword={changeAccountPassword}/>
      </section>}
      {!loading&&user&&screen==='workspace'&&!user.mustChangePassword&&recoveryCodes.length===0&&<SchoolWorkspaceShell contextPlacement={(ordinaryTeacher&&page==='tasks')||(groupedWorkspace&&!['classes','admission','recovery'].includes(page))?'after':'before'} homePage={workspaceHome} compactNavigation={ordinaryTeacher||parentWorkspace||groupedWorkspace} learner={user.role==='STUDENT'} page={page} items={schoolNavigation(user.role,studentStatus,access,campusParentReportEnabled,canAuthorPrivateTools)} onNavigate={navigateWorkspace} context={professionalScopePage?undefined:workspaceContext}>
        {page==='overview'&&user.role==='STUDENT'&&studentStatus==='APPROVED'&&<SchoolLearnerHome key={user.id} api={api} username={user.username} items={schoolNavigation(user.role,studentStatus,access,campusParentReportEnabled,canAuthorPrivateTools)} onNavigate={navigateWorkspace}/>}
        {page==='overview'&&groupedWorkspace&&<SchoolProfessionalHome administrator={administratorWorkspace} items={educatorEntries} username={user.username} schoolName={orgs.find(org=>org.id===schoolId)?.name} onNavigate={navigateWorkspace}/>}
        {page==='overview'&&!groupedWorkspace&&!(user.role==='STUDENT'&&studentStatus==='APPROVED')&&<SchoolWorkspaceOverview compact={ordinaryTeacher||parentWorkspace} parent={parentWorkspace} username={user.username} items={schoolNavigation(user.role,studentStatus,access,campusParentReportEnabled,canAuthorPrivateTools)} onNavigate={navigateWorkspace} pending={user.role==='STUDENT'&&studentStatus!=='APPROVED'?<section className="hs-panel"><h2>我的校园活动</h2><p>{studentStatus==='PENDING_CLASS_APPROVAL'?'账号已注册，正在等待班级整体审批。':'目前暂无可参加的校园活动。请向学校确认注册及审批状态。'}</p><p>尚未审批的账号不能进入历史课程、校园测评或学生报告。</p></section>:undefined}/>}
        {page==='account'&&<section className={'hs-panel hs-account-panel'+(user.role==='STUDENT'?' hs-student-account':'')+(administratorWorkspace?' hs-admin-panel hs-admin-account':'')}><div>{administratorWorkspace?<SchoolReportHeader compact title="校园账号" label="校园账号使用说明"><p>你使用的是独立校园账号。可用功能由学校授权决定。</p></SchoolReportHeader>:<h2>校园账号</h2>}<p>用户名：{user.username}</p>
          {!administratorWorkspace&&<p>你使用的是独立校园账号。可用功能由学校授权决定。</p>}</div>
          <div><h3>修改密码</h3>
          <ProductPasswordChange product="school" busy={working} onChangePassword={changeAccountPassword}/></div>
        </section>}
        {page==='account'&&['STUDENT','TEACHER','ADMIN'].includes(user.role)&&<SchoolPersonnelClaim key={user.id} api={api} student={user.role==='STUDENT'} onComplete={()=>void refresh()}/>}
        {page==='account'&&(user.role==='TEACHER'||user.role==='ADMIN')&&<section className={'hs-panel hs-account-security'+(administratorWorkspace?' hs-admin-panel hs-admin-security':'')}>
          <SchoolReportHeader compact title="敏感操作二次验证" label="二次验证使用说明"><p>学校管理员与心理专业人员在执行名册、人员授权或整班审批前，需要最近五分钟内的动态验证码。普通教师无需使用此功能。</p></SchoolReportHeader>
          <div className="hs-actions">
            <label className="hs-field"><span>验证器 6 位动态验证码</span>
              <input value={stepUpCode} onChange={event=>setStepUpCode(event.target.value)}
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </label>
            <button disabled={working||!/^[0-9]{6}$/.test(stepUpCode)}
              onClick={()=>void stepUp()}>重新验证高权限操作</button>
          </div>
        </section>}
        {user.role==='STUDENT'?
          studentStatus==='APPROVED'?<>
            {page==='tasks'&&<SchoolStudentTasks key={user.id} api={api} activityId={new URLSearchParams(window.location.search).get('activityId')??undefined}/>}
            {page==='feedback'&&<SchoolStudentFeedback api={api}/>}
            {page==='family'&&<SchoolParentLinks api={api} role="STUDENT" organizationId={schoolId}/>}
            {page==='sharing'&&campusParentReportEnabled&&<SchoolStudentReportConsent api={api}/>}
            {page==='peer'&&<SchoolPeerConsent api={api} role="STUDENT"/>}
          </>:
            null:
        user.role==='TEACHER'||user.role==='ADMIN'?<>
          {administratorClassPage&&<div className="hs-professional-recovery"><SchoolProfessionalClassScope>{workspaceContext}</SchoolProfessionalClassScope><SchoolAdminPanel title="年级与班级维护" label="年级与班级管理说明" help={<p>先建立年级，再将新班级归入对应年级。学校与班级选择用于切换当前管理范围。</p>}><a className="hs-structure-import-toggle" href={workspaceHref('personnel')+(workspaceHref('personnel').includes('?')?'&':'?')+'importKind=GRADE'} onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace('personnel','GRADE')}}>批量导入年级／班级</a>{managementLinks('classes')}<div className="hs-structure-summary">{units.filter(u=>u.unitKind==='GRADE').map(grade=><details key={grade.id}><summary>{grade.name}<span>{units.filter(u=>u.unitKind==='CLASS'&&u.parentUnitId===grade.id).length} 个班级</span></summary><ul>{units.filter(u=>u.unitKind==='CLASS'&&u.parentUnitId===grade.id).map(cls=><li key={cls.id}>{cls.name}</li>)}</ul></details>)}</div><details className="hs-admin-manual-create"><summary>手动新建年级／班级</summary><div className="hs-admin-create-grid"><section><h3>新增年级</h3>{field('新建年级名称',gradeName,setGradeName)}<button disabled={working||!schoolId} onClick={()=>void createUnit('GRADE')}>增加年级</button></section><section><h3>新增班级</h3>{field('新建班级名称',className,setClassName)}<label className="hs-field"><span>所属年级</span><select value={parentGrade} onChange={e=>setParentGrade(e.target.value)}><option value="">请选择年级</option>{units.filter(x=>x.unitKind==='GRADE').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button disabled={working||!parentGrade} onClick={()=>void createUnit('CLASS')}>增加班级</button></section></div></details></SchoolAdminPanel></div>}
          {administratorPersonnelPage&&schoolId&&<><section className="hs-panel hs-personnel-school" aria-label="人员名单学校选择">{workspaceContext}</section><SchoolPersonnelDirectory titleHidden api={api} organizationId={schoolId} units={units} onUnits={setUnits} disabled={working} initialImportKind={initialImportKind==='GRADE'||initialImportKind==='CLASS'?initialImportKind:undefined}/></>}
          {page==='classes'&&professionalClassPage&&<SchoolProfessionalClassScope>{workspaceContext}</SchoolProfessionalClassScope>}
          {page==='classes'&&!professionalClassPage&&!administratorClassPage&&<section className="hs-panel"><h2>学校与班级</h2>
            {schoolAdmin&&<div className="hs-grid"><div>{field('新建年级名称',gradeName,setGradeName)}<button disabled={working||!schoolId} onClick={()=>void createUnit('GRADE')}>增加年级</button></div>
            <div>{field('新建班级名称',className,setClassName)}<label className="hs-field"><span>所属年级</span><select value={parentGrade} onChange={e=>setParentGrade(e.target.value)}>
              <option value="">请选择年级</option>{units.filter(x=>x.unitKind==='GRADE').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <button disabled={working||!parentGrade} onClick={()=>void createUnit('CLASS')}>增加班级</button></div></div>}
            {!schoolAdmin&&<p>选择学校和班级后，可进入你已获授权的校园功能。</p>}
          </section>}
          {administratorAdmissionPage&&<div className="hs-professional-admission"><SchoolProfessionalClassScope admission>{workspaceContext}</SchoolProfessionalClassScope>{!schoolId||!classId?<section className="hs-panel hs-recovery-empty"><h2>选择要管理的班级</h2><p>选择班级后，可查看进度并管理资格名册、激活码与注册窗口。</p></section>:<SchoolAdminSections key={classPath} label="班级注册管理" busy={working} panes={[
            {id:'progress',title:'注册进度',content:<SchoolAdmissionProgress classSelected summary={summary} working={working} approvalDisabled={classApprovalDisabled} onRefresh={()=>void loadSummary()} onApprove={()=>void approve()} showApproval={psychologyStaff}/>},
            {id:'roster',title:'资格名册',content:<SchoolAdminPanel title="更新资格名册" label="资格名册使用说明" help={<p>此处录入当前班级的学号资格名单，每行一个、不含表头；不会直接建立学生账号，也不接收姓名或初始密码。已注册、注册开放或已审批时仍按原有规则锁定名册。</p>}><label className="hs-field"><span>学号名单（每行一个，不含表头）</span><textarea value={roster} onChange={e=>setRoster(e.target.value)} rows={6}/></label><button disabled={working||!roster.trim()} onClick={()=>void saveRoster()}>更新资格名册</button></SchoolAdminPanel>},
            {id:'codes',title:'激活码',content:<SchoolAdminPanel title="一次性激活码" label="激活码使用说明" help={<p>以下注册码只在本次操作显示，请分别安全交付给学生。</p>}><button disabled={working} onClick={()=>void issueCodes()}>批量生成一次性激活码</button>{issuedCodes.length>0&&<div className="hs-secret"><p>以下注册码只在本次操作显示，请分别安全交付给学生：</p>{issuedCodes.map(code=><code key={code}>{code}</code>)}</div>}</SchoolAdminPanel>},
            {id:'window',title:'注册窗口',content:<SchoolAdminPanel title="班级注册窗口" label="注册窗口使用说明" help={<p>设置注册截止时间后开启注册；注册状态与整班身份审批分别核验。</p>}><label className="hs-field"><span>注册截止时间</span><input type="datetime-local" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label><div className="hs-actions"><button disabled={working||!windowEnd} onClick={()=>void actionWindow('OPEN')}>开启注册</button><button disabled={working} onClick={()=>void actionWindow('CLOSE')}>关闭注册</button></div><details className="hs-admin-registration-link"><summary>查看注册链接</summary><code className="hs-break">{joinUrl}</code></details></SchoolAdminPanel>},
          ]}/>}</div>}
          {professionalAdmissionPage&&<SchoolProfessionalAdmission classSelected={!!schoolId&&!!classId} summary={summary} working={working} approvalDisabled={classApprovalDisabled} onRefresh={()=>void loadSummary()} onApprove={()=>void approve()}>{workspaceContext}</SchoolProfessionalAdmission>}
          {page==='admission'&&!professionalAdmissionPage&&!administratorAdmissionPage&&schoolId&&classId&&<section className="hs-panel"><h2>班级注册与审批</h2>
            {schoolAdmin&&<p>注册链接：<code className="hs-break">{joinUrl}</code></p>}
            {summary&&<p>状态：{summary.status} · 名册预期 {summary.rosterExpectedCount} · 当前资格 {summary.eligibleCount} · 已注册 {summary.registeredCount} · 待处理异常 {summary.unresolvedIncidents} · 版本 {summary.rosterVersion}</p>}
            <button onClick={()=>void loadSummary()} disabled={working}>刷新班级状态</button>
            {schoolAdmin&&<><label className="hs-field"><span>学号名单（每行一个，不含表头）</span>
              <textarea value={roster} onChange={e=>setRoster(e.target.value)} rows={6}/></label>
            <button disabled={working||!roster.trim()} onClick={()=>void saveRoster()}>更新资格名册</button>
            <div className="hs-actions"><button disabled={working} onClick={()=>void issueCodes()}>批量生成一次性激活码</button>
              <label className="hs-field"><span>注册截止时间</span><input type="datetime-local" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label>
              <button disabled={working||!windowEnd} onClick={()=>void actionWindow('OPEN')}>开启注册</button>
              <button disabled={working} onClick={()=>void actionWindow('CLOSE')}>关闭注册</button></div></>}
            {psychologyStaff&&<button className="hs-primary"
              disabled={classApprovalDisabled}
              onClick={()=>void approve()}>心理教师 · 确认整班身份审批</button>}
            {psychologyStaff&&schoolClassApprovalReasons(summary).length>0&&<ul aria-label="班级审批待办">
              {schoolClassApprovalReasons(summary).map(reason=><li key={reason}>{reason}</li>)}
            </ul>}
            {schoolAdmin&&issuedCodes.length>0&&<div className="hs-secret"><p>以下注册码只在本次操作显示，请分别安全交付给学生：</p>{issuedCodes.map(code=><code key={code}>{code}</code>)}</div>}
          </section>}
          {professionalRecoveryPage&&<div className="hs-professional-recovery"><SchoolProfessionalClassScope recovery>{workspaceContext}</SchoolProfessionalClassScope>{schoolId&&classId?<SchoolRecoveryOfficer compact key={classPath} api={api} classPath={classPath}/>:<section className="hs-panel hs-recovery-empty"><h2>选择要处理的班级</h2><p>选择班级后，可进入账号恢复与注册异常处理。</p></section>}</div>}
          {page==='recovery'&&!professionalRecoveryPage&&(schoolAdmin||psychologyStaff)&&schoolId&&classId&&
            <SchoolRecoveryOfficer key={classPath} api={api} classPath={classPath}/>}
          {page==='private-tools'&&schoolId&&(canAuthorPrivateTools?<EducationPrivateToolStudio key={`SCHOOL:${user.id}:${schoolId}`} api={api} organizationId={schoolId} entry="SCHOOL" actorId={user.id} onDraftStateChange={setPrivateDraftState}/>:<section className="hs-panel"><h2>我的工具</h2><p>当前账号或学校暂无私有量表与表单编制权限。</p></section>)}
          {page==='tasks'&&(user.role==='TEACHER'||user.role==='ADMIN')&&schoolId&&access?.personas.includes('TEACHER')&&<SchoolTeacherTasks compact={ordinaryTeacher} key={'SchoolTeacherTasks:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='relationships'&&schoolAdmin&&schoolId&&<><section className="hs-management-related">{managementLinks('relationships')}<a href={workspaceHref('personnel')} onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateWorkspace('personnel')}}>按人员查看有效权限 →</a></section><SchoolRelationships compact={administratorWorkspace} key={'SchoolRelationships:'+schoolId} api={api} organizationId={schoolId} classes={units}/></>}
          {import.meta.env.VITE_REPORT_PRIVACY_PREFERENCES_V1_ENABLED==='true'
            &&page==='activities'&&schoolId
            &&canManageSchoolActivities(access)
            &&<details className="hs-panel"><summary>评价与报告隐私偏好（只需设置一次）</summary>
              <ReportPrivacyPreferences key={schoolId} organizationId={schoolId} api={api}
                scenarios={['SCHOOL_GENERAL_EDUCATION_GROUP','SCHOOL_SENSITIVE_WELLBEING_GROUP']}/>
            </details>}
          {page==='activities'&&schoolId&&access&&canManageSchoolActivities(access)&&<SchoolActivityManager
            key={'SchoolActivityManager:'+user?.id+':'+schoolId} api={api} organizationId={schoolId}
            compact={ordinaryTeacher||groupedWorkspace} isAdmin={schoolAdmin} classes={units} canAuthorPrivateTools={canAuthorPrivateTools} actorKey={user?.id}/>}
          {page==='group-reports'&&(schoolAdmin||(psychologyStaff&&access?.capabilities.includes('PSYCHOLOGY_STAFF')))&&schoolId
            &&!access?.explicitDenies.some(x=>['*','REPORT_READ','ORG_GROUP_REPORT_V1'].includes(x))
            &&<SchoolGroupReports compact={groupedWorkspace} key={'SchoolGroupReports:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='group-trends'&&(schoolAdmin||(psychologyStaff&&access?.capabilities.includes('PSYCHOLOGY_STAFF')))&&schoolId
            &&!access?.explicitDenies.some(x=>['*','REPORT_READ','ORG_GROUP_REPORT_V1'].includes(x))
            &&<SchoolGroupLongitudinal compact={groupedWorkspace} key={'SchoolGroupLongitudinal:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='protected-reports'&&psychologyStaff&&schoolId&&access?.capabilities.includes('PSYCHOLOGY_STAFF')
            &&!access?.explicitDenies.some(x=>['*','PSYCHOLOGY_STAFF','REPORT_READ','ORG_PROTECTED_FEEDBACK_V1'].includes(x))
            &&<SchoolProtectedReportStudio compact={professionalWorkspace} key={'SchoolProtectedReportStudio:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='individual-trends'&&psychologyStaff&&schoolId&&access?.capabilities.includes('PSYCHOLOGY_STAFF')
            &&!access?.explicitDenies.some(x=>['*','PSYCHOLOGY_STAFF','REPORT_READ','ORG_INDIVIDUAL_REPORT_V1'].includes(x))
            &&<SchoolIndividualLongitudinalStudio compact={professionalWorkspace} key={'SchoolIndividualLongitudinalStudio:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='professional-reports'&&psychologyStaff&&schoolId&&<SchoolProfessionalReports compact={professionalWorkspace} key={'SchoolProfessionalReports:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='report-review'&&campusParentReportEnabled&&psychologyStaff&&schoolId
            &&access?.capabilities.includes('PARENT_REPORT_DISCLOSURE')
            &&!access?.explicitDenies.some(x=>['*','REPORT_READ','PARENT_REPORT_DISCLOSURE'].includes(x))
            &&<SchoolReportOfficer key={'SchoolReportOfficer:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='report-officers'&&campusParentReportEnabled&&schoolAdmin&&schoolId&&<SchoolDisclosureOfficers key={'SchoolDisclosureOfficers:'+schoolId} api={api} organizationId={schoolId}/>}
          {page==='report-review'&&!campusParentReportEnabled&&(schoolAdmin||psychologyStaff)&&<p>家长版报告披露尚未正式开放，需完成逐资源科学审核后单独启用。</p>}
          {page==='staff'&&schoolAdmin&&schoolId&&<SchoolAdminPanel className="hs-admin-staff" title="邀请校园教职员工" label="人员邀请使用说明" help={<p>岗位、心理专业权限和学校管理员权限分别设置。教师通过邀请码自行注册；当前不支持整份教师名单直接建号。邀请码仅显示一次，请安全交付给受邀人员。</p>}>
            <div className="hs-admin-staff-fields"><label className="hs-field"><span>岗位</span><select value={staffPersona} onChange={e=>setStaffPersona(e.target.value as 'TEACHER'|'COUNSELOR')}>
              <option value="TEACHER">普通教师</option><option value="COUNSELOR">心理教师</option></select></label>
              <label><input type="checkbox" checked={staffPsych} onChange={e=>setStaffPsych(e.target.checked)}/> 心理专业权限</label>
              <label><input type="checkbox" checked={staffAdmin} onChange={e=>setStaffAdmin(e.target.checked)}/> 学校管理员</label>
              <button disabled={working} onClick={()=>void invite()}>生成邀请</button></div>
            {newInvite&&<div className="hs-secret"><p>仅显示一次的邀请码：</p><code>{newInvite}</code></div>}
          </SchoolAdminPanel>}
        </>:<div>
          {page==='family'&&<SchoolParentLinks api={api} role="PARENT"/>}
          {page==='peer'&&<SchoolPeerConsent api={api} role="PARENT"/>}
          {page==='tasks'&&<SchoolParentTasks api={api}/>}
          {page==='parent-reports'&&campusParentReportEnabled&&<SchoolParentReports api={api}/>}
        </div>}
        {['admission','recovery'].includes(page)&&!professionalAdmissionPage&&!administratorAdmissionPage&&!professionalRecoveryPage&&!classId&&(schoolAdmin||psychologyStaff)&&<section className="hs-panel"><h2>先选择一个班级</h2><p>在上方选择学校和班级后，继续处理该班级的事务。</p></section>}
      </SchoolWorkspaceShell>}
    </main>
    <footer className="hs-footer">School · 科学支持 · 专业陪伴 · 健康成长</footer>
  </div>
}

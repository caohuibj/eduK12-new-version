import {SurveyWaveContentSelection,type WaveContentSelection,type FrozenWaveContent} from './SurveyWaveContentSelection'
import { productOrigins, surveyRecruitmentUrl } from '../products/origins'
import { useCallback, useRef, useEffect,useState,type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { SurveyFlowStudio,type FormQuestionInfo } from './SurveyFlowStudio'
import type { FlowDraft } from './flow.client'
import { SurveyStudyPreview } from './SurveyStudyPreview'
import type { CognitivePreviewSnapshot } from './ResearchCognitivePreview'
import type { FormDraft, ResearchDraft, ScaleDraft } from './builder.types'
import { useInstrumentLibrary, type InstrumentLibrary } from './instrument-library'

type RawFeedbackChoice={metricKeys:string[];release:'AFTER_FINAL'|'AFTER_COLLECTION'}
type ApiResult<T>={code:number|string;message:string;data:T|null}
type Instrument={id:string;title:string;kind:string;status:string;instrumentKey:string}
type InstrumentDetails=Instrument&{catalogGrantId?:string|null;readOnly?:boolean;revision?:number;definition:FormDraft|Record<string,unknown>}
type Project={id:string;collectionMode:'LINKED_WAVES'|'SINGLE_UNLINKED';status:'DRAFT'|'ACTIVE'|'PAUSED'|'CLOSED'|'ARCHIVED';revision:number}
type GroupIpPolicy={schemaVersion:1;timeZone:string;activationDate?:string}
type Wave={
  frozenContentSelections?:FrozenWaveContent[]
  frozenParticipantFeedback?:{draftId:string;instrumentKey:string;title:string;participantFeedback:({mode:'GENERAL'|'DESCRIPTIVE'}&RawFeedbackChoice)|null}[]
  id:string;projectId:string;title:string;ordinal:number;status:'DRAFT'|'OPEN'|'PAUSED'|'CLOSED';
  revision:number;instrumentIds:string[];publicationId:string|null;
  consentText:string;generalText:string;consentVersion:number;linkageNoticeConfirmed:boolean;
  opensAt:string|null;closesAt:string|null;finishUntil:string|null;
  quotaStarts:number|null;startsCount:number;allowNewParticipants:boolean;
  hardStopAt:string|null
  flowDefinition?:FlowDraft|null
  quotaPolicy?:{schemaVersion:1;groupLimits:Record<string,number>}|null
  checkpointPolicy?:{schemaVersion:1;enabled:true;ttlHours:number}|null
  groupIpPolicy?:GroupIpPolicy|null
  groupIpActivatedAt?:string|null
}
type FlowCounts={starts:number;assigned:number;completedFinal:number;analysisIncluded:number;
  qualityExcluded:number;withdrawn:number;screenedOut:number;inProgress:number}
type FlowAnalytics={flowDigest:string;asOf:string;total:FlowCounts;
  groups:{groupKey:string;counts:FlowCounts}[];
  quotaReservations:{groupKey:string;maxAssigned:number;everAssigned:number;available:number}[];
  category?:{instrumentKey:string;itemKey:string;counts:Record<string,number>};
  score?:{instrumentKey:string;scoreKey:string;minGroupN:number;suppressedGroups:number;
    groups:{groupKey:string;respondentN:number;scoreValidN:number;
      mean:number|null;sampleSd:number|null}[];note:string};
  limits:{complete:boolean;maxAttempts:number;noTruncation:boolean}}
type Preflight={ok:boolean;publicationReady:boolean;reason:string;checks:{
  key:string;ok:boolean;issues:string[];digest?:string}[]}
const surveyApi=async <T,>(path:string,method='GET',body?:unknown):Promise<T>=>{
  let token=''
  const cookies=document.cookie.split('; ')
  const csrfCookie=cookies.find(x=>x.startsWith('huisurvey_research_csrf='))
  if(csrfCookie)token=decodeURIComponent(csrfCookie.split('=').slice(1).join('='))
  if(method!=='GET'&&!token){
    const response=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
    if(!response.ok)throw new Error('安全令牌不可用')
    const data=await response.json() as ApiResult<{csrfToken:string}>
    token=data.data?.csrfToken||''
  }
  const r=await fetch('/api/survey'+path,{
    method,credentials:'same-origin',headers:{
      'Content-Type':'application/json',...(method!=='GET'?{'X-CSRF-Token':token}:{}),
    },...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const result=await r.json() as ApiResult<T>
  if(!r.ok||result.code!==0||result.data===null)
    throw Object.assign(new Error(result.message||'请求失败'),{status:r.status})
  return result.data
}
const message=(e:unknown)=>e instanceof Error?e.message:'研究波次操作失败'
const initial=()=>({
  title:'',consentText:'',generalText:'',linkageNoticeConfirmed:false,instrumentIds:[] as string[],
  opensAt:'',closesAt:'',quotaStarts:'',allowNewParticipants:false,
  flowDefinition:null as FlowDraft|null,
  quotaPolicy:null as {schemaVersion:1;groupLimits:Record<string,number>}|null,
  checkpointPolicy:null as {schemaVersion:1;enabled:true;ttlHours:number}|null,
  groupIpPolicy:null as GroupIpPolicy|null,
})
type FormState=ReturnType<typeof initial>
const localTime=(raw:string|null)=>{
  if(!raw)return ''
  const date=new Date(raw)
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
}
const groupTime=(raw:string,timeZone:string)=>new Date(raw).toLocaleString('zh-CN',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
})
export function SurveyWaveStudio({projectId,instrumentLibrary,onProjectChanged}:{
  projectId:string;instrumentLibrary?:InstrumentLibrary;onProjectChanged?:(project:Project)=>void
}){
  const path='/projects/'+encodeURIComponent(projectId)
  const [waves,setWaves]=useState<Wave[]>([])
  const {list:tools,page:toolPage,refresh:refreshTools,error:toolsError,loading:toolsLoading,revision:instrumentsRevision}=useInstrumentLibrary(projectId,instrumentLibrary)
  const [details,setDetails]=useState<Record<string,InstrumentDetails>>({})
  const [participantFeedback,setParticipantFeedback]=useState<Record<string,RawFeedbackChoice>>({})
  const [contentSelections,setContentSelections]=useState<WaveContentSelection[]>([])
  const [pendingFreeze,setPendingFreeze]=useState<{projectId:string;waveId:string;body:{revision:number;contentSelections?:WaveContentSelection[];participantFeedback?:unknown[]};canRetry:boolean}|null>(null)
  const freezeLock=useRef(false)
  const activePending=pendingFreeze?.projectId===projectId?pendingFreeze:null

  const [detailsError,setDetailsError]=useState(''),[detailsRetry,setDetailsRetry]=useState(0)
  const [wavePage,setWavePage]=useState(1),[waveError,setWaveError]=useState('')
  const [project,setProject]=useState<Project|null>(null)
  const [editing,setEditing]=useState<Wave|null>(null),[form,setForm]=useState<FormState>(initial)
  const [ready,setReady]=useState<Preflight|null>(null),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [shareLink,setShareLink]=useState('')
  const previewEpoch=useRef(0),projectEpoch=useRef(0),selectionEpoch=useRef(0)
  const waveRequest=useRef(0),projectRequest=useRef(0),actionRequest=useRef(0)
  const detailReads=useRef({path,revision:instrumentsRevision,selection:0,requests:new Map<string,Promise<InstrumentDetails>>()})
  const [studyPreview,setStudyPreview]=useState<{drafts:ResearchDraft[];snapshots:Record<string,CognitivePreviewSnapshot>;flow:FlowDraft|null;consentText:string;generalText:string}|null>(null)
  const [flowAnalytics,setFlowAnalytics]=useState<FlowAnalytics|null>(null)
  const [categoryKey,setCategoryKey]=useState('')
  const [scoreSelection,setScoreSelection]=useState('')
  const refreshWaves=useCallback(async(page:number)=>{
    const epoch=projectEpoch.current,request=++waveRequest.current
    setWaveError('')
    try{
      const result=await surveyApi<{list:Wave[]}>(path+'/waves?page='+page)
      if(epoch!==projectEpoch.current||request!==waveRequest.current)return
      setWaves(result.list);setWavePage(page)
    }catch(e){if(epoch===projectEpoch.current&&request===waveRequest.current)setWaveError(message(e))}
  },[path])
  const refreshProject=useCallback(async()=>{
    const epoch=projectEpoch.current,request=++projectRequest.current
    const result=await surveyApi<Project>(path)
    if(epoch!==projectEpoch.current||request!==projectRequest.current)return
    setProject(result);onProjectChanged?.(result)
  },[path,onProjectChanged])
  const refresh=async()=>{await Promise.all([refreshWaves(wavePage),refreshProject()])}
  useEffect(()=>{
    const projects=projectEpoch,selections=selectionEpoch,previews=previewEpoch
    const epoch=++projects.current
    previewEpoch.current++;selectionEpoch.current++;setStudyPreview(null);setEditing(null);setReady(null);setShareLink('');setForm(initial());setDetails({})
    setWaves([]);setWavePage(1);setProject(null);setError('');setNotice('');setBusy(false)
    void Promise.all([refreshWaves(1),refreshProject()]).catch(e=>{if(epoch===projectEpoch.current)setError(message(e))})
    return()=>{projects.current++;selections.current++;previews.current++}
  },[refreshWaves,refreshProject])
  useEffect(()=>{setParticipantFeedback({})},[path,instrumentsRevision,form.instrumentIds])
  const contentScope=JSON.stringify([path,editing?.id,editing?.revision,instrumentsRevision,form.instrumentIds])
  useEffect(()=>{
    setContentSelections(previous=>{if(previous.length&&!editing?.publicationId)setNotice('波次或工具已更新，未冻结的报告／参考选择已清空，请重新核对选择。');return []})
  },[contentScope])
  useEffect(()=>{if(!activePending)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)
  },[activePending])

  useEffect(()=>{
    let current=true
    const previous=detailReads.current
    const reset=previous.path!==path||previous.revision!==instrumentsRevision||previous.selection!==selectionEpoch.current
    if(reset)detailReads.current={path,revision:instrumentsRevision,selection:selectionEpoch.current,requests:new Map()}
    const requests=detailReads.current.requests
    const ids=form.instrumentIds
    for(const id of requests.keys())if(!ids.includes(id))requests.delete(id)
    setDetails(items=>reset?{}:Object.fromEntries(Object.entries(items).filter(([id])=>ids.includes(id))))
    setDetailsError('')
    // One owner follows the current selection and mutation version. Changing
    // the selection joins existing reads instead of replacing newer details
    // with an older selection's response. Only selected identities are kept.
    void Promise.all(ids.map(id=>{
      let request=requests.get(id)
      if(!request){
        const pending=surveyApi<InstrumentDetails>(path+'/instruments/'+id)
        request=pending.catch(error=>{if(requests.get(id)===request)requests.delete(id);throw error})
        requests.set(id,request)
      }
      return request
    })).then(items=>{if(current)setDetails(Object.fromEntries(items.map(item=>[item.id,item])))})
      .catch(e=>{if(current)setDetailsError(message(e))})
    return()=>{current=false}
  },[path,instrumentsRevision,form.instrumentIds,detailsRetry])
  const act=async(action:()=>Promise<void>)=>{
    const epoch=projectEpoch.current,request=++actionRequest.current
    setError('');setNotice('');setBusy(true)
    const pending=action(),selection=selectionEpoch.current
    try{await pending}catch(e){if(epoch===projectEpoch.current&&selection===selectionEpoch.current)setError(message(e))}
    finally{if(epoch===projectEpoch.current&&request===actionRequest.current)setBusy(false)}
  }
  const select=(wave:Wave)=>void act(async()=>{
    const selection=++selectionEpoch.current,epoch=projectEpoch.current
    setParticipantFeedback({})
    previewEpoch.current++;setStudyPreview(null)
    const detail=await surveyApi<Wave>(path+'/waves/'+wave.id)
    if(selection!==selectionEpoch.current||epoch!==projectEpoch.current)return
    setEditing(detail);setReady(null);setShareLink('');setFlowAnalytics(null);setCategoryKey('');setScoreSelection('')
    setForm({
      title:detail.title,consentText:detail.consentText,generalText:detail.generalText,
      linkageNoticeConfirmed:detail.linkageNoticeConfirmed,
      instrumentIds:detail.instrumentIds,
      opensAt:localTime(detail.opensAt),closesAt:localTime(detail.closesAt),
      quotaStarts:detail.quotaStarts===null?'':String(detail.quotaStarts),
      allowNewParticipants:detail.allowNewParticipants,
      flowDefinition:detail.flowDefinition??null,
      quotaPolicy:detail.quotaPolicy??null,
      checkpointPolicy:detail.checkpointPolicy??null,
      groupIpPolicy:detail.groupIpPolicy??null,
    })
  })
  const previewStudy=()=>void act(async()=>{
    const epoch=++previewEpoch.current,saved=structuredClone(form)
    setStudyPreview(null)
    const drafts=await Promise.all(form.instrumentIds.map(id=>surveyApi<ResearchDraft>(path+'/instruments/'+id)))
    const snapshots:Record<string,CognitivePreviewSnapshot>={}
    for(const draft of drafts.filter(d=>d.kind==='COGNITIVE')){
      const result=await surveyApi<{ok:boolean;cognitivePreview?:CognitivePreviewSnapshot}>(path+'/instruments/'+draft.id+'/validate','POST',{})
      if(!result.ok||!result.cognitivePreview)throw new Error(draft.title+' 尚未通过编译，无法预览')
      snapshots[draft.instrumentKey]=result.cognitivePreview
    }
    if(epoch===previewEpoch.current)setStudyPreview({drafts,snapshots,flow:saved.flowDefinition,consentText:saved.consentText,generalText:saved.generalText})
  })
  const payload=()=>{
    const start=!form.groupIpPolicy&&form.opensAt?new Date(form.opensAt):null
    const stop=form.closesAt?new Date(form.closesAt):null
    return {
      title:form.title,consentText:form.consentText,generalText:form.generalText,
      linkageNoticeConfirmed:form.linkageNoticeConfirmed,
      instrumentIds:form.instrumentIds,
      opensAt:start?.toISOString()||null,
      closesAt:stop?.toISOString()||null,
      quotaStarts:form.quotaStarts?Number(form.quotaStarts):null,
      allowNewParticipants:form.allowNewParticipants,
      flowDefinition:form.flowDefinition,
      quotaPolicy:form.quotaPolicy,
      checkpointPolicy:form.checkpointPolicy,
      groupIpPolicy:form.groupIpPolicy?{schemaVersion:1,timeZone:form.groupIpPolicy.timeZone}:null,
    }
  }
  const save=(e:FormEvent)=>{e.preventDefault();void act(async()=>{
    const epoch=projectEpoch.current,selection=selectionEpoch.current
    const body=payload()
    const wave=editing
      ?await surveyApi<Wave>(path+'/waves/'+editing.id,'PATCH',{...body,revision:editing.revision})
      :await surveyApi<Wave>(path+'/waves','POST',{...body,requestId:crypto.randomUUID()})
    if(epoch!==projectEpoch.current)return
    if(selection===selectionEpoch.current){
      setEditing(wave);setReady(null);setFlowAnalytics(null)
      setNotice('波次草稿已保存；冻结定义和正式开放需要分别确认')
    }
    await refreshWaves(wavePage)
  })}
  const preflight=()=>{if(!editing)return;void act(async()=>{
    const epoch=projectEpoch.current,selection=selectionEpoch.current
    const result=await surveyApi<Preflight>(path+'/waves/'+editing.id+'/preflight','POST',{})
    if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
    setReady(result)
    setNotice(result.ok?'研究内容预检通过；发布阶段仍须通过运行时和权限门禁':'当前波次尚不满足发布条件')
  })}
  const verifyFreeze=async(pending:NonNullable<typeof pendingFreeze>,rejectedMessage?:string)=>{
    const epoch=projectEpoch.current,selection=selectionEpoch.current
    const fresh=await surveyApi<Wave>(path+'/waves/'+pending.waveId)
    if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
    if(fresh.publicationId){
      setEditing(fresh);setPendingFreeze(null);setReady(null);setFlowAnalytics(null);setError('')
      setNotice('服务器已冻结此波次。下方显示实际冻结版本，请核对；不会替换为当前最新版本。')
      await refresh()
    }else if(fresh.revision===pending.body.revision){
      if(rejectedMessage){setPendingFreeze(null);setError(rejectedMessage+'；已核对波次仍未冻结，原报告／参考选择保留，可修正后重新提交。');return}
      setPendingFreeze({...pending,canRetry:true});setError('当前尚未读取到冻结结果，可核对或重试原修订及完全相同的选择；不能改选后重试。')
    }else{
      setPendingFreeze(null);setEditing(fresh);setReady(null)
      setError('波次修订已变化，本次冻结尚未确认。请核对当前波次后重新选择，不沿用旧请求。')
    }
  }
  const freezeWave=(retry=false)=>{
    if(!editing||freezeLock.current||busy||(!retry&&activePending))return
    const pending=retry?activePending:{projectId,waveId:editing.id,canRetry:false,body:{revision:editing.revision,
      ...(contentSelections.length?{contentSelections:structuredClone(contentSelections)}:{}),
      ...(Object.keys(participantFeedback).length?{participantFeedback:Object.entries(participantFeedback).map(([instrumentId,choice])=>({instrumentId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',...choice}}))}:{}),
    }}
    if(!pending||retry&&!pending.canRetry)return
    freezeLock.current=true;setPendingFreeze({...pending,canRetry:false})
    void act(async()=>{
      const epoch=projectEpoch.current,selection=selectionEpoch.current
      let accepted=false
      try{
        await surveyApi(path+'/waves/'+pending.waveId+'/prepare','POST',pending.body);accepted=true
        if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
        await verifyFreeze(pending)
      }catch(cause){
        if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
        const status=(cause as {status?:number}).status
        if(!accepted&&!retry&&status!==undefined&&status>=400&&status<500){
          setPendingFreeze(null);setError(message(cause)+'；原报告／参考选择保留，请核对后重新提交。');return
        }
        setError('冻结结果尚未确认，请先读取服务器状态，不要改选或重复创建。')
        try{await verifyFreeze(pending,!accepted&&retry&&status===409?message(cause):undefined)}catch{setError('冻结结果与状态读取均未确认。原请求保留，请重试核对；不要更换版本。')}
      }finally{freezeLock.current=false}
    })
  }
  const lifecycle=(operation:'prepare'|'open'|'pause'|'resume'|'close'|'hard-stop')=>{
    if(!editing)return
    if(operation==='prepare'){freezeWave();return}
    const wave=editing
    if(operation==='open'&&!productOrigins()){setError('当前地址不支持生成招募链接');return}
    if(['close','hard-stop'].includes(operation)&&
      !window.confirm(operation==='hard-stop'
        ?'确认紧急停止此波次？已经开始但尚未提交的作答也将禁止 FINAL。'
        :'确认关闭本波次？新的被试将无法开始。'))return
    void act(async()=>{
      const epoch=projectEpoch.current,selection=selectionEpoch.current
      if(operation==='open')setShareLink('')
      const result=await surveyApi<{researchUrl?:string}>(path+'/waves/'+wave.id+'/'+operation,'POST',{
        revision:wave.revision,
      })
      if(epoch!==projectEpoch.current)return
      if(selection!==selectionEpoch.current){await refresh();return}
      if(result.researchUrl){
        const link=surveyRecruitmentUrl(result.researchUrl)
        if(!link)throw new Error('招募链接地址不受支持，请联系管理员')
        setShareLink(link)
      }
      const fresh=await surveyApi<Wave>(path+'/waves/'+wave.id)
      if(epoch!==projectEpoch.current)return
      if(selection!==selectionEpoch.current){await refresh();return}
      setEditing(fresh);await refresh()
      if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
      setReady(null);setFlowAnalytics(null)
      setNotice(operation==='open'?'已创建一次性招募链接，请通过受控渠道交付':
          '波次状态已更新')
    })
  }
  const transitionProject=(action:'pause'|'resume'|'close')=>{
    if(!project)return
    if(action==='close'&&!window.confirm(
      '确认永久结束本研究项目？将停止全部波次的新准入，已完成的 FINAL 仍按研究说明保留。'
    ))return
    void act(async()=>{
      const epoch=projectEpoch.current
      await surveyApi(path+'/'+action,'POST',{revision:project.revision})
      if(epoch!==projectEpoch.current)return
      await refresh()
      if(epoch!==projectEpoch.current)return
      setNotice(action==='pause'?'整个研究项目已暂停新准入':
        action==='resume'?'研究项目已恢复':'研究项目已结束，历史已完成研究数据仍保留。')
    })
  }
  const entryToken=(action:'rotate'|'revoke')=>{
    if(action==='rotate'&&!productOrigins()){setError('当前地址不支持生成招募链接');return}
    if(!editing||!['OPEN','PAUSED'].includes(editing.status))return
    if(action==='revoke'&&!window.confirm('撤销本波次全部已签发的招募链接？已有参与者的个人恢复凭证不会被撤销。'))return
    void act(async()=>{
      const epoch=projectEpoch.current,selection=selectionEpoch.current
      setShareLink('')
      const result=await surveyApi<{researchUrl?:string;revoked?:boolean}>(
        path+'/waves/'+editing.id+'/entry-token/'+action,'POST',{revision:editing.revision})
      if(epoch!==projectEpoch.current)return
      if(selection!==selectionEpoch.current){await refresh();return}
      const link=result.researchUrl?surveyRecruitmentUrl(result.researchUrl):''
      if(link===null)throw new Error('招募链接地址不受支持，请联系管理员')
      setShareLink(link)
      const fresh=await surveyApi<Wave>(path+'/waves/'+editing.id)
      if(epoch!==projectEpoch.current)return
      if(selection!==selectionEpoch.current){await refresh();return}
      setEditing(fresh);await refresh()
      if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
      setNotice(action==='rotate'?'已轮换招募链接：旧链接立即失效，请保存下方新链接。'
        :'招募链接已撤销，现有研究参与者仍可凭私人凭证恢复合法作答。')
    })
  }
  const loadFlowAnalytics=()=>{
    if(!editing)return
    void act(async()=>{
      const epoch=projectEpoch.current,selection=selectionEpoch.current
      const category=categoryKey?(()=>{
        const [instrumentKey,itemKey]=categoryKey.split(':')
        return {instrumentKey,itemKey}
      })():undefined
      const score=scoreSelection?(()=>{
        const [instrumentKey,scoreKey]=scoreSelection.split(':')
        return {instrumentKey,scoreKey}
      })():undefined
      const data=await surveyApi<FlowAnalytics>(
        path+'/analytics/waves/'+editing.id+'/flow-cohort','POST',
        {...(category?{category}:{}),...(score?{score}:{})})
      if(epoch!==projectEpoch.current||selection!==selectionEpoch.current)return
      setFlowAnalytics(data)
      setNotice('已读取受控 Flow 样本统计。若包含实验分组，小样本详情仍不可公开转发。')
    })
  }
  const toggle=(id:string,checked:boolean)=>{
    setForm(old=>({...old,
      instrumentIds:checked?[...old.instrumentIds,id]:old.instrumentIds.filter(k=>k!==id),
    }))
  }
  const flowTools=[...new Map([...tools,...Object.values(details)].map(t=>[t.id,t])).values()]
  const flowQuestions:FormQuestionInfo[]=Object.values(details)
    .filter(d=>d.kind==='FORM').flatMap(d=>{
      const form=d.definition as FormDraft
      return (form.pages??[]).flatMap(p=>p.questions.map(q=>({
        instrumentKey:d.instrumentKey,itemKey:q.itemKey,prompt:q.prompt,type:q.type,
        options:q.options.map(o=>({optionKey:o.optionKey,label:o.label})),
      })))
    })
  const flowMetrics=Object.values(details)
    .filter(d=>form.instrumentIds.includes(d.id)&&['SCALE','SJT'].includes(d.kind))
    .flatMap(d=>{
      const def=d.definition as {
        dimensions?:{dimensionKey:string;label:string}[];
        metrics?:{metricKey:string;label:string}[];
      }
      const list=d.kind==='SCALE'
        ?(def.dimensions??[]).map(x=>({key:x.dimensionKey,label:x.label}))
        :(def.metrics??[]).map(x=>({key:x.metricKey,label:x.label}))
      return list.map(x=>({instrumentKey:d.instrumentKey,scoreKey:x.key,label:x.label}))
    })
  const feedbackTools=Object.values(details).filter(d=>
    editing?.instrumentIds.includes(d.id)&&form.instrumentIds.includes(d.id)&&
    ['SCALE','SJT'].includes(d.kind)&&!d.catalogGrantId&&!d.readOnly)
    .map(d=>{
      const totalScore=d.kind==='SCALE'?(d.definition as ScaleDraft).totalScore:undefined
      return {...d,metrics:[...flowMetrics.filter(metric=>metric.instrumentKey===d.instrumentKey),
        ...(totalScore?[{instrumentKey:d.instrumentKey,scoreKey:totalScore.key,label:totalScore.label}]:[])]}
    })
  const feedbackInvalid=Object.entries(participantFeedback).some(([id,choice])=>{
    const tool=feedbackTools.find(tool=>tool.id===id)
    return !tool||!choice.metricKeys.length||choice.metricKeys.some(key=>!tool.metrics.some(metric=>metric.scoreKey===key))
  })
  return <section className="border rounded-xl bg-white p-4 sm:p-6 my-5 space-y-5" aria-label="研究波次">
    <header><h2 className="text-xl font-semibold">研究波次 · T1 / T2 / T3</h2>
      <p className="text-sm text-slate-600">
        {project?.collectionMode==='LINKED_WAVES'
          ?'本项目用同一随机研究编号关联 T1、T2、T3 等波次；被试需保存私密恢复凭证。'
          :'本项目每轮均为独立匿名作答，不生成跨波次关联研究编号，也不允许个人纵向匹配。'}
        波次正式发布后，题目、评分和知情同意即被冻结；改变测量内容应建立新波次。</p></header>
    {error&&<p role="alert" className="bg-red-50 border-l-4 border-red-600 p-3">{error}</p>}
    {waveError&&<div role="alert" className="bg-red-50 border-l-4 border-red-600 p-3">{waveError}
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void act(()=>refreshWaves(wavePage))}>重试波次列表</button></div>}
    {detailsError&&<div role="alert" className="bg-red-50 border-l-4 border-red-600 p-3">{detailsError}
      <button type="button" className="btn-secondary" onClick={()=>setDetailsRetry(value=>value+1)}>重试已选工具详情</button></div>}
    {toolsError&&<div role="alert" className="bg-red-50 border-l-4 border-red-600 p-3">{toolsError}
      <button type="button" className="btn-secondary" disabled={toolsLoading} onClick={()=>void act(()=>refreshTools(toolPage))}>重试波次工具列表</button></div>}
    {notice&&<p role="status" className="bg-teal-50 border-l-4 border-teal-600 p-3">{notice}</p>}
    {activePending&&<div role="status" className="border rounded p-3"><p>此波次冻结结果待核对，原修订和报告／参考选择已锁定。刷新页面后须读取该波次实际冻结摘要，不应重新选择版本。</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void act(()=>verifyFreeze(activePending))}>核对原冻结请求</button>
      {activePending.canRetry&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>freezeWave(true)}>重试原冻结请求</button>}
    </div>}
    <fieldset disabled={!!activePending} className="min-w-0 border-0 p-0 space-y-4">
    {project&&<div className="border rounded-lg bg-slate-50 p-3 space-y-3">
      <div className="flex justify-between gap-3 flex-wrap items-center">
        <p className="text-sm">整体研究状态：<strong>{project.status}</strong></p>
        <div className="flex flex-wrap gap-2">
          {project.status==='ACTIVE'&&<button type="button" className="btn-secondary"
            disabled={busy} onClick={()=>transitionProject('pause')}>暂停整个研究</button>}
          {project.status==='PAUSED'&&<button type="button" className="btn-secondary"
            disabled={busy} onClick={()=>transitionProject('resume')}>恢复整个研究</button>}
          {['ACTIVE','PAUSED'].includes(project.status)&&<button type="button" className="btn-secondary"
            disabled={busy} onClick={()=>transitionProject('close')}>结束整个研究</button>}
        </div>
      </div>
      <p className="text-xs text-slate-600">暂停停止新的研究参与者准入；已开始的合法答卷仍遵循有限的完成窗口。关闭研究不会物理删除既有数据。</p>
    </div>}
    <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-5">
      <nav aria-label="研究波次列表" className="space-y-2">
        <button className="btn-secondary w-full" type="button" onClick={()=>{
          previewEpoch.current++;selectionEpoch.current++;setParticipantFeedback({});setDetails({});setStudyPreview(null);setEditing(null);setForm(initial());setReady(null);setShareLink('')
        }}>新建波次</button>
        <div className="flex items-center justify-between text-xs gap-2">
          <button type="button" className="btn-secondary" disabled={busy||wavePage<=1}
            onClick={()=>void act(()=>refreshWaves(wavePage-1))}>上一页</button>
          <span>波次第 {wavePage} 页</span>
          <button type="button" className="btn-secondary" disabled={busy||waves.length<25}
            onClick={()=>void act(()=>refreshWaves(wavePage+1))}>下一页</button>
        </div>
        {waves.map(w=><button type="button" key={w.id} disabled={busy}
          className={'block w-full rounded-lg border text-left p-3 '+(w.id===editing?.id?'bg-sky-50 border-sky-700':'bg-white')}
          onClick={()=>select(w)}><strong className="block text-sm">{'T'+w.ordinal+' · '+w.title}</strong>
          <span className="text-xs">{w.status} {w.publicationId?' · 已冻结':''}</span></button>)}
      </nav>
      <div className="space-y-4 min-w-0">
        {(!editing||editing.status==='DRAFT'&&!editing.publicationId)&&<form className="space-y-4" onSubmit={save}>
          <h3 className="font-semibold">{editing?'修改未发布波次':'创建波次草稿'}</h3>
          <button type="button" className="btn-secondary" disabled={busy||!form.instrumentIds.length} onClick={previewStudy}>预览整轮研究流程</button>
          <label className="block text-sm">波次标题<input className="input block w-full" required
            value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label className="block text-sm">参与说明与知情同意
            <textarea className="input block w-full" rows={6} required minLength={20}
              value={form.consentText} onChange={e=>setForm({...form,consentText:e.target.value})}/></label>
          {project?.collectionMode==='LINKED_WAVES'&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold">跨时间点可关联研究的必要告知</p>
            <p className="text-sm my-2">本项目会用随机研究编号关联同一参与者在 T1、T2、T3 等不同时间点的作答。
              研究编号不等于真实姓名，但此模式属于项目内可关联的假名化研究，而非完全不可关联的匿名。
              被试须保留本人私密恢复凭证，并了解撤回和数据保留政策。未成年人还应按研究规定核对适用同意。</p>
            <label className="flex gap-2 text-sm items-start"><input type="checkbox"
              checked={form.linkageNoticeConfirmed}
              onChange={e=>setForm({...form,linkageNoticeConfirmed:e.target.checked})}/>
              我已将跨波次关联、研究编号、参加自愿性及撤回说明明确写入本轮知情同意材料，并将在正式提交前供被试确认。</label>
          </div>}
          <label className="block text-sm">通用完成反馈（不显示个人分数）
            <textarea className="input block w-full" rows={3} value={form.generalText}
              onChange={e=>setForm({...form,generalText:e.target.value})}/></label>
          <fieldset className="border p-3 rounded-lg"><legend className="font-semibold text-sm">本波次使用的研究工具</legend>
            {tools.filter(t=>t.status==='DRAFT'||(t.kind==='SCALE'&&t.status==='PUBLISHED')).map(t=><label key={t.id} className="block text-sm my-2">
              <input type="checkbox" checked={form.instrumentIds.includes(t.id)}
                onChange={e=>toggle(t.id,e.target.checked)}/> {t.kind} · {t.title}</label>)}
            {!tools.filter(t=>t.status==='DRAFT'||(t.kind==='SCALE'&&t.status==='PUBLISHED')).length&&<p className="text-xs">请先通过 Builder 创建研究工具。</p>}
          <div className="flex items-center justify-between text-xs gap-2">
            <button type="button" className="btn-secondary" disabled={busy||toolPage<=1}
              onClick={()=>void act(()=>refreshTools(toolPage-1))}>工具上一页</button>
            <span>研究工具第 {toolPage} 页，已选择 {form.instrumentIds.length} 项</span>
            <button type="button" className="btn-secondary" disabled={busy||tools.length<25}
              onClick={()=>void act(()=>refreshTools(toolPage+1))}>工具下一页</button>
          </div>
          </fieldset>
          <SurveyFlowStudio value={form.flowDefinition}
            onChange={flowDefinition=>setForm(old=>({...old,flowDefinition,
              quotaPolicy:flowDefinition?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'?null:old.quotaPolicy}))}
            tools={flowTools} selectedIds={form.instrumentIds} questions={flowQuestions}
            collectionMode={project?.collectionMode??'SINGLE_UNLINKED'}/>
          <fieldset className="border rounded-xl p-4 space-y-2">
            <legend className="text-sm font-semibold">实验组条件配额（可选）</legend>
            <label className="text-sm flex gap-2">
              <input type="checkbox" checked={!!form.quotaPolicy} disabled={!form.flowDefinition?.experiment||form.flowDefinition.experiment.mode==='QUESTIONNAIRE_VARIANTS'}
                onChange={e=>setForm(prev=>({...prev,quotaPolicy:e.target.checked
                  ?{schemaVersion:1,groupLimits:Object.fromEntries(
                    (prev.flowDefinition?.experiment?.groups??[]).map(g=>[g.groupKey,100]))}:null}))}/>
              首次准入时按实验组原子占用名额</label>
            {form.flowDefinition?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'&&<p className="text-sm">A/B问卷子版本使用随机概率，不支持实验组配额。</p>}
            {form.quotaPolicy&&form.flowDefinition?.experiment?.mode!=='QUESTIONNAIRE_VARIANTS'&&form.flowDefinition?.experiment?.groups.map(g=>
              <label key={g.groupKey} className="block text-xs">组别 {g.groupKey} 最大入场数（1–10000）
                <input className="input block w-full" type="number" min={1} max={10000}
                  value={form.quotaPolicy?.groupLimits[g.groupKey]??''}
                  onChange={e=>setForm(prev=>({...prev,quotaPolicy:prev.quotaPolicy?{
                    ...prev.quotaPolicy,groupLimits:{...prev.quotaPolicy.groupLimits,[g.groupKey]:Number(e.target.value)}}:null}))}/>
              </label>)}
            <p className="text-xs text-slate-500">入场配额与有效 FINAL 样本量不同；撤回及质量排除不自动返还名额。</p>
          </fieldset>
          <fieldset className="border rounded-xl p-4 space-y-2">
            <legend className="text-sm font-semibold">加密临时保存（默认关闭）</legend>
            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={!!form.checkpointPolicy}
                onChange={e=>setForm(prev=>({...prev,checkpointPolicy:e.target.checked
                  ?{schemaVersion:1,enabled:true,ttlHours:24}:null}))}/>
              允许参与者主动保存未完成答案（单次最多 64KB）</label>
            {form.checkpointPolicy&&<label className="block text-xs">存档有效期（1–48小时）
              <input className="input block w-full" type="number" min={1} max={48}
                value={form.checkpointPolicy.ttlHours}
                onChange={e=>setForm(prev=>({...prev,checkpointPolicy:prev.checkpointPolicy
                  ?{...prev.checkpointPolicy,ttlHours:Number(e.target.value)}:null}))}/>
            </label>}
            <p className="text-xs text-slate-500">暂存不是 FINAL；完成、筛除及撤回时销毁，凭研究专用私密凭证跨设备恢复。</p>
          </fieldset>
          <fieldset className="border rounded-xl p-4 space-y-2">
            <legend className="text-sm font-semibold">同 IP 集体作答（默认关闭）</legend>
            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={!!form.groupIpPolicy}
                onChange={e=>setForm(prev=>({...prev,groupIpPolicy:e.target.checked
                  ?{schemaVersion:1,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}:null}))}/>
              允许本轮同一 IP 集体作答，不设 IP 人数上限</label>
            {form.groupIpPolicy&&<label className="block text-sm">集体作答时区（IANA，冻结后不可修改）
              <input className="input block w-full" required value={form.groupIpPolicy.timeZone}
                placeholder="Asia/Shanghai"
                onChange={e=>setForm(prev=>({...prev,groupIpPolicy:prev.groupIpPolicy
                  ?{...prev.groupIpPolicy,timeZone:e.target.value}:null}))}/>
            </label>}
            {form.groupIpPolicy&&<p className="text-xs text-slate-600">下方结束时间按当前设备时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}）输入；冻结后的截止时间按上述时区显示。</p>}
            <p className="text-xs text-slate-600">启用后须在冻结当天（按所选时区）点击“正式开放本轮”，立即生效。
              结束时间留空时，开放后 48 小时自动结束；填写时须在 48 小时内，可提前截止。到期无宽限，暂停或恢复不延长窗口。</p>
            <p className="text-xs text-slate-600">仅在本轮时间窗内取消同 IP 请求限额；邀请凭证、知情同意、身份验证、总名额和实验组配额仍有效。</p>
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">计划开放时间<input type="datetime-local" className="input block w-full"
              disabled={!!form.groupIpPolicy} value={form.groupIpPolicy?'':form.opensAt} onChange={e=>setForm({...form,opensAt:e.target.value})}/></label>
            <label className="block text-sm">结束新参与时间<input type="datetime-local" className="input block w-full"
              value={form.closesAt} onChange={e=>setForm({...form,closesAt:e.target.value})}/></label>
          </div>
          <label className="block text-sm">名额上限（留空为无限额，均受平台保护）
            <input type="number" min="1" step="1" className="input block w-full"
              value={form.quotaStarts} onChange={e=>setForm({...form,quotaStarts:e.target.value})}/></label>
          <label className="block text-sm"><input type="checkbox" checked={form.allowNewParticipants}
            onChange={e=>setForm({...form,allowNewParticipants:e.target.checked})}/>
            允许在本轮新领取研究编号并中途加入（T2+ 默认关闭）</label>
          <button type="submit" className="btn-primary" disabled={busy||!form.title||form.consentText.length<20}>
            {editing?'保存波次草稿':'创建波次'}</button>
        </form>}
        {studyPreview&&<SurveyStudyPreview drafts={studyPreview.drafts} cognitiveSnapshots={studyPreview.snapshots} flow={studyPreview.flow} consentText={studyPreview.consentText} generalText={studyPreview.generalText} onClose={()=>{previewEpoch.current++;setStudyPreview(null)}}/>}
        {editing&&<div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold">T{editing.ordinal} · {editing.title}</h3>
          <p className="text-sm">状态：{editing.status} · revision {editing.revision} · 已启动 {editing.startsCount}
            {editing.quotaStarts!==null?'/'+editing.quotaStarts:''}</p>
          <p className="text-sm">公开发布使用独立研究权限和冻结定义；是否可发布由当前环境的权限与配置决定。</p>
          {editing.publicationId&&<section className="border rounded-lg p-3 space-y-2" aria-label="已冻结的集体作答设置">
            <label className="flex gap-2 text-sm"><input type="checkbox" disabled checked={!!editing.groupIpPolicy}/>
              允许本轮同一 IP 集体作答，不设 IP 人数上限</label>
            {editing.groupIpPolicy&&<>
              <label className="block text-sm">集体作答时区（IANA，冻结后不可修改）
                <input className="input block w-full" disabled value={editing.groupIpPolicy.timeZone}/></label>
              {!editing.groupIpActivatedAt&&<p className="text-sm">须在 {editing.groupIpPolicy.activationDate??'冻结当天'}（{editing.groupIpPolicy.timeZone}）正式开放，点击后立即生效。</p>}
              {editing.groupIpActivatedAt&&<p className="text-sm">已于 {groupTime(editing.groupIpActivatedAt,editing.groupIpPolicy.timeZone)}（{editing.groupIpPolicy.timeZone}）开放。</p>}
              {editing.closesAt&&<p className="text-sm">集体作答截止：{groupTime(editing.closesAt,editing.groupIpPolicy.timeZone)}（{editing.groupIpPolicy.timeZone}）。</p>}
              <p className="text-xs text-slate-600">开放后最长 48 小时，到期自动结束且无宽限；暂停或恢复不会续期。邀请、同意、身份与名额限制仍有效。</p>
            </>}
          </section>}
          <section className="border rounded-lg p-3 space-y-3" aria-label="受控原始指标反馈">
            <h4 className="font-semibold">被试原始指标反馈（默认关闭）</h4>
            {editing.publicationId?<div className="text-sm space-y-2"><p>反馈设置已随研究定义冻结，不可修改。</p>
                {editing.frozenParticipantFeedback?editing.frozenParticipantFeedback.map(item=><p key={item.draftId}>
                  {item.title}（{item.instrumentKey}）：{item.participantFeedback?.mode==='DESCRIPTIVE'
                    ?'原始指标 '+item.participantFeedback.metricKeys.join('、')+'；'+(item.participantFeedback.release==='AFTER_COLLECTION'?'本轮采集结束后':'本人正式提交后')
                    :'未启用原始指标反馈'}
                </p>):<p>当前未取得冻结反馈配置，请刷新后核对；不能从当前草稿推断。</p>}
                {editing.frozenParticipantFeedback?.length===0&&<p>本版本没有可配置原始指标反馈的 Scale/SJT 工具。</p>}
              </div>:<>
              <p className="text-sm">仅在本次冻结时提交所选指标，不随“保存波次草稿”保存；离开波次或工具更新后需重新选择。匿名身份不推断年龄或角色，不提供参考等级、常模或研究者报告模板。指标来自当前草稿供选择，后端仍须校验实际已发布测量版本。</p>
              {feedbackTools.map(tool=><fieldset key={tool.id} className="border rounded p-2 space-y-2">
                <legend>{tool.kind} · {tool.title}</legend>
                <label className="block text-sm"><input type="checkbox" checked={!!participantFeedback[tool.id]} disabled={busy}
                  onChange={e=>setParticipantFeedback(old=>{const next={...old};if(e.target.checked)next[tool.id]={metricKeys:[],release:'AFTER_FINAL'};else delete next[tool.id];return next})}/>
                  启用 {tool.title} 的原始指标反馈</label>
                {participantFeedback[tool.id]&&<>
                  {tool.metrics.map(metric=><label key={metric.scoreKey} className="block text-sm"><input type="checkbox" disabled={busy}
                    checked={participantFeedback[tool.id].metricKeys.includes(metric.scoreKey)}
                    onChange={e=>setParticipantFeedback(old=>({...old,[tool.id]:{...old[tool.id],metricKeys:e.target.checked
                      ?[...old[tool.id].metricKeys,metric.scoreKey]:old[tool.id].metricKeys.filter(key=>key!==metric.scoreKey)}}))}/>
                    {tool.title}：{metric.label}（{metric.scoreKey}）</label>)}
                  <label className="block text-sm">{tool.title} 反馈开放时机<select className="input block" disabled={busy}
                    value={participantFeedback[tool.id].release} onChange={e=>setParticipantFeedback(old=>({...old,[tool.id]:{...old[tool.id],release:e.target.value as RawFeedbackChoice['release']}}))}>
                    <option value="AFTER_FINAL">本人正式提交后</option><option value="AFTER_COLLECTION">本轮采集结束后</option>
                  </select></label>
                </>}
              </fieldset>)}
              {!feedbackTools.length&&<p className="text-sm">请先保存本波次选择的原生 Scale/SJT 工具。FORM、认知任务及目录工具不在此配置。</p>}
              {feedbackInvalid&&<p role="alert" className="text-sm">启用的反馈须至少选择一个当前有效指标。</p>}
            </>}
          </section>
          <SurveyWaveContentSelection key={contentScope} base={path+'/waves/'+editing.id} revision={editing.revision}
            tools={Object.values(details).filter(tool=>editing.instrumentIds.includes(tool.id)&&form.instrumentIds.includes(tool.id))}
            request={surveyApi} value={contentSelections} onChange={setContentSelections} disabled={busy||!!activePending}
            published={!!editing.publicationId} frozen={editing.frozenContentSelections}/>
          <div className="flex flex-wrap gap-2">
            {editing.status==='DRAFT'&&!editing.publicationId&&<>
              <button type="button" className="btn-secondary" disabled={busy} onClick={preflight}>检查知情同意与所有工具</button>
              <button type="button" className="btn-secondary" disabled={busy||!ready?.ok||feedbackInvalid} onClick={()=>lifecycle('prepare')}>冻结研究定义</button>
            </>}
            {editing.status==='DRAFT'&&editing.publicationId&&
              <button type="button" className="btn-primary" disabled={busy} onClick={()=>lifecycle('open')}>正式开放本轮</button>}
            {editing.status==='OPEN'&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('pause')}>暂停新参与</button>}
            {editing.status==='PAUSED'&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('resume')}>恢复开放</button>}
            {editing.status==='CLOSED'&&!editing.hardStopAt&&editing.finishUntil
              &&new Date(editing.finishUntil).getTime()>Date.now()&&
              <button type="button" className="btn-secondary" disabled={busy}
                onClick={()=>lifecycle('hard-stop')}>紧急终止剩余在途作答</button>}
            {['OPEN','PAUSED'].includes(editing.status)&&<>
              <button type="button" className="btn-secondary" disabled={busy}
                onClick={()=>entryToken('rotate')}>轮换招募链接</button>
              <button type="button" className="btn-secondary" disabled={busy}
                onClick={()=>entryToken('revoke')}>撤销全部招募链接</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('close')}>结束招募</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('hard-stop')}>紧急终止</button>
            </>}
          </div>
          {editing.publicationId&&editing.flowDefinition&&<section className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">Flow 实验样本与条件配额 · 受控统计</h4>
            <p className="text-xs text-slate-600">统计必须由项目 Owner 持最近五分钟 TOTP 会话读取。
              入场 Assigned、完成 FINAL、有效样本、质量排除和撤回是不同分母。最多 6000 Attempt；
              不会将未读尾页冒充完整统计。</p>
            <label className="block text-xs">单选 Form 分类变量（可选）
              <select className="input block w-full" value={categoryKey}
                onChange={e=>{setCategoryKey(e.target.value);setFlowAnalytics(null)}}>
                <option value="">仅实验组别及总样本</option>
                {flowQuestions.filter(q=>['SINGLE','LIKERT'].includes(q.type)&&
                  flowTools.some(t=>form.instrumentIds.includes(t.id)&&t.instrumentKey===q.instrumentKey)).map(q=>
                  <option key={q.instrumentKey+':'+q.itemKey} value={q.instrumentKey+':'+q.itemKey}>
                    {q.instrumentKey} · {q.prompt}</option>)}
              </select>
            </label>
            <label className="block text-xs">随机实验条件 × Scale/SJT 研究性指标（可选）
              <select className="input block w-full" value={scoreSelection}
                onChange={e=>{setScoreSelection(e.target.value);setFlowAnalytics(null)}}>
                <option value="">仅查看人数与分类频数</option>
                {flowMetrics.map(m=>
                  <option key={m.instrumentKey+':'+m.scoreKey}
                    value={m.instrumentKey+':'+m.scoreKey}>
                    {m.instrumentKey} · {m.label}（{m.scoreKey}）</option>)}
              </select>
            </label>
            <button className="btn-secondary" type="button" disabled={busy}
              onClick={loadFlowAnalytics}>读取最新受控统计</button>
            {flowAnalytics&&<div className="overflow-x-auto space-y-3">
              <p className="text-xs break-all">Flow Digest：{flowAnalytics.flowDigest} · 截止
                {new Date(flowAnalytics.asOf).toLocaleString('zh-CN')}</p>
              <p className="text-sm">启动 {flowAnalytics.total.starts} · 已分配
                {flowAnalytics.total.assigned} · 有效 FINAL {flowAnalytics.total.analysisIncluded} ·
                质量排除 {flowAnalytics.total.qualityExcluded} · 撤回
                {flowAnalytics.total.withdrawn} · 筛除 {flowAnalytics.total.screenedOut}</p>
              <table className="w-full text-xs border-collapse"><thead><tr>
                <th className="border p-2 text-left">条件组</th>
                <th className="border p-2">已分配</th>
                <th className="border p-2">有效 FINAL</th>
                <th className="border p-2">排除</th>
                <th className="border p-2">剩余名额</th>
              </tr></thead><tbody>{flowAnalytics.groups.map(g=><tr key={g.groupKey}>
                <td className="border p-2">{g.groupKey}</td>
                <td className="border p-2">{g.counts.assigned}</td>
                <td className="border p-2">{g.counts.analysisIncluded}</td>
                <td className="border p-2">{g.counts.qualityExcluded}</td>
                <td className="border p-2">{flowAnalytics.quotaReservations
                  .find(q=>q.groupKey===g.groupKey)?.available??'无硬配额'}</td>
              </tr>)}</tbody></table>
              {flowAnalytics.score&&<div className="border-t pt-3 space-y-2">
                <h5 className="font-medium text-sm">实验条件组 · {flowAnalytics.score.instrumentKey} /
                  {flowAnalytics.score.scoreKey}</h5>
                {flowAnalytics.score.groups.map(g=><p className="text-sm" key={g.groupKey}>
                  {g.groupKey}：有效 FINAL N={g.respondentN}，有分数 N={g.scoreValidN}，
                  M={g.mean?.toFixed(2)??'—'}，SD={g.sampleSd?.toFixed(2)??'—'}</p>)}
                <p className="text-xs text-slate-600">未展示的小样本组 {flowAnalytics.score.suppressedGroups}；
                  最少 {flowAnalytics.score.minGroupN} 份有效组别样本且达到同等有分数 N 才展示统计。
                  {flowAnalytics.score.note}</p>
              </div>}
              {flowAnalytics.category&&<div className="text-xs">
                <p className="font-medium">分类：{flowAnalytics.category.instrumentKey} /
                  {flowAnalytics.category.itemKey}（仅有效 FINAL）</p>
                {Object.entries(flowAnalytics.category.counts).map(([key,n])=>
                  <span className="inline-block mr-3" key={key}>{key}: {n}</span>)}
              </div>}
              <p className="text-xs text-slate-500">此统计包含全部经过验证的样本范围，不含原始文本。
                已撤回的分组身份不再可逆向关联，不应将历史配额数强行加总为当前分析 N。</p>
            </div>}
          </section>}
          {ready&&<div className="rounded-lg border p-3 space-y-2">
            <p className="font-semibold text-sm">{ready.ok?'结构预检通过':'结构预检失败'}</p>
            {ready.checks.map(c=><div key={c.key} className="text-sm">
              <p>{c.key}：{c.ok?'通过':'需要修订'}</p>
              {c.issues.map((m,i)=><p role="alert" key={i} className="text-red-700">{m}</p>)}
            </div>)}
          </div>}
          {shareLink&&<div className="rounded-lg border p-3">
            <p>本次开放的一次性招募链接（只显示本次）：</p>
            <code className="block break-all text-sm my-3">{shareLink}</code>
            <div className="w-fit border rounded-lg bg-white p-3">
              <QRCodeSVG value={shareLink} size={168} title="研究参与招募二维码"/>
            </div>
            <button type="button" className="btn-secondary" onClick={()=>void navigator.clipboard.writeText(shareLink)}>
              复制研究链接</button>
            <p className="text-xs mt-2">链接中包含招募能力，勿上传到公开日志。被试的私密恢复凭证并不在此链接中。</p>
          </div>}
        </div>}
      </div>
    </div>
    </fieldset>
  </section>
}
